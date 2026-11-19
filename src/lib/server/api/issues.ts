import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { access, atLeast } from '../access.js';
import { toUser, type UserRow } from '../accounts.js';
import { record } from '../activity.js';
import type { RepoRow } from '../repos.js';
import { bool, now, threadRepoOf as repoOf, slice, userByLogin, userJson, type RepoCtx } from './common.js';
import { commentJson, issueJson, labelJson, milestoneJson, type CommentRow, type IssueRow, type LabelRow, type MilestoneRow } from './shapes.js';
import { me, page, Paged, route, type Ctx } from './router.js';
import { notify } from './notify.js';

export const repoRef = (r: RepoCtx) => ({ full: r.full, name: r.row.name, owner: r.row.owner, id: r.row.id });

export function issueOf(c: Ctx, r: RepoCtx, number = Number(c.params.index)) {
	return c.db.query<IssueRow, [number, number]>('select * from issues where repo_id = ? and number = ?').get(r.row.id, number) ?? error(404, `#${number} not found`);
}

export function event(db: Database, issueId: number, userId: number, kind: string, data: Record<string, unknown> = {}) {
	db.query('insert into events (issue_id, user_id, kind, data) values (?, ?, ?, ?)').run(issueId, userId, kind, JSON.stringify(data));
	touch(db, issueId);
}
export const touch = (db: Database, issueId: number) => db.query("update issues set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(issueId);

// Issue authors may edit their own issue; otherwise it takes write access.
export function canEdit(c: Ctx, r: RepoCtx, i: IssueRow) {
	return atLeast(r.level, 'write') || i.user_id === c.user?.id;
}

export function nextNumber(db: Database, repoId: number) {
	const n = db.query<{ next_number: number }, [number]>('update repos set next_number = next_number + 1 where id = ? returning next_number - 1 as next_number').get(repoId)!.next_number;
	return n;
}

export function createIssue(c: Ctx, r: RepoCtx, b: { title: string; body?: string; labels?: number[]; assignees?: string[]; milestone?: number }, isPull = false) {
	const u = me(c);
	if (!b.title?.trim()) error(422, 'Give it a title');
	const milestone = atLeast(r.level, 'write') && b.milestone
		? (c.db.query<{ id: number }, [number, number]>('select id from milestones where id = ? and repo_id = ?').get(b.milestone, r.row.id) ?? error(422, 'No such milestone')).id
		: null;
	const id = c.db.transaction(() => {
		const number = nextNumber(c.db, r.row.id);
		const id = Number(
			c.db.query('insert into issues (repo_id, number, user_id, title, body, is_pull, milestone_id) values (?, ?, ?, ?, ?, ?, ?)').run(r.row.id, number, u.id, b.title.trim(), b.body ?? '', isPull ? 1 : 0, milestone)
				.lastInsertRowid
		);
		// Only people who can write may triage while creating; others' labels and assignees are dropped, as Forgejo does.
		if (atLeast(r.level, 'write')) {
			for (const l of b.labels ?? []) c.db.query('insert or ignore into issue_labels (issue_id, label_id) select ?, id from labels where id = ? and repo_id = ?').run(id, l, r.row.id);
			for (const login of b.assignees ?? []) {
				const a = userByLogin(c.db, login);
				if (a) c.db.query('insert or ignore into assignees (issue_id, user_id) values (?, ?)').run(id, a.id);
			}
		}
		c.db.query('insert or ignore into subscriptions (user_id, issue_id) values (?, ?)').run(u.id, id);
		return id;
	})();
	const issue = c.db.query<IssueRow, [number]>('select * from issues where id = ?').get(id)!;
	record(c.db, { userId: u.id, repoId: r.row.id, op: isPull ? 'create_pull_request' : 'create_issue', content: JSON.stringify([String(issue.number), issue.title]) });
	notify(c, r, issue, isPull ? 'opened a pull request' : 'opened an issue', b.body ?? '');
	return issue;
}

// --- lists ---

function listIssues(c: Ctx, r: RepoCtx | null, repoIds: number[]) {
	const q = c.url.searchParams;
	const state = q.get('state') ?? 'open';
	const type = q.get('type');
	const where = [`i.repo_id in (${repoIds.map(() => '?').join(',') || 'null'})`];
	const args: (string | number)[] = [...repoIds];
	if (state !== 'all') where.push('i.state = ?'), args.push(state === 'closed' ? 'closed' : 'open');
	if (type === 'issues') where.push('i.is_pull = 0');
	if (type === 'pulls') where.push('i.is_pull = 1');
	const labels = (q.get('labels') ?? '').split(',').filter(Boolean);
	for (const l of labels) where.push('exists (select 1 from issue_labels il join labels lb on lb.id = il.label_id where il.issue_id = i.id and (lb.name = ? or lb.id = ?))'), args.push(l, Number(l) || -1);
	const ms = (q.get('milestones') ?? q.get('milestone') ?? '').split(',').filter(Boolean);
	if (ms.length) where.push(`i.milestone_id in (select id from milestones where ${ms.map(() => '(title = ? or id = ?)').join(' or ')})`), args.push(...ms.flatMap((m) => [m, Number(m) || -1]));
	const assigned = q.get('assigned_by') ?? q.get('assignee');
	if (assigned) {
		const a = userByLogin(c.db, assigned) ?? error(404, `No user called ${assigned}`);
		where.push('exists (select 1 from assignees a where a.issue_id = i.id and a.user_id = ?)'), args.push(a.id);
	}
	const created = q.get('created_by');
	if (created) where.push('i.user_id = (select id from users where login = ?)'), args.push(created);
	if (bool(q.get('review_requested')) && c.user) where.push('exists (select 1 from review_requests rr where rr.issue_id = i.id and rr.user_id = ?)'), args.push(c.user.id);
	if (bool(q.get('assigned')) && c.user) where.push('exists (select 1 from assignees a where a.issue_id = i.id and a.user_id = ?)'), args.push(c.user.id);
	if (bool(q.get('created')) && c.user) where.push('i.user_id = ?'), args.push(c.user.id);
	for (const login of [q.get('mentioned_by'), bool(q.get('mentioned')) ? c.user?.login : null]) {
		if (!login) continue;
		where.push('(mentions_login(i.body, ?) or exists (select 1 from comments cm where cm.issue_id = i.id and mentions_login(cm.body, ?)))'), args.push(login, login);
	}
	const text = q.get('q');
	if (text) where.push("(i.title like '%' || ? || '%' or i.body like '%' || ? || '%')"), args.push(text, text);
	const sort = { oldest: 'i.created_at asc', recentupdate: 'i.updated_at desc', leastupdate: 'i.updated_at asc', mostcomment: '(select count(*) from comments where issue_id = i.id) desc', newest: 'i.created_at desc' }[
		q.get('sort') ?? 'newest'
	] ?? 'i.created_at desc';
	const rows = c.db.query<IssueRow, (string | number)[]>(`select i.* from issues i where ${where.join(' and ')} order by i.pinned desc, ${sort}`).all(...args);
	const p = page(c, 30);
	const repoRows = new Map<number, RepoRow>();
	const refFor = (id: number) => {
		if (r) return repoRef(r);
		const row = repoRows.get(id) ?? c.db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(id)!;
		repoRows.set(id, row);
		return { full: `${row.owner}/${row.name}`, name: row.name, owner: row.owner, id: row.id };
	};
	return new Paged(
		slice(rows, p).map((i) => issueJson(c.db, c.origin, refFor(i.repo_id), i)),
		rows.length
	);
}

route('GET', '/repos/:owner/:repo/issues', (c) => {
	const r = repoOf(c);
	return listIssues(c, r, [r.row.id]);
});
route('GET', '/repos/issues/search', (c) => {
	const rows = c.db.query<RepoRow, []>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id').all();
	const ids = rows.filter((r) => atLeast(access(c.db, c.user?.id, r), 'read')).map((r) => r.id);
	return listIssues(c, null, ids);
});

// --- one issue ---

route('POST', '/repos/:owner/:repo/issues', async (c) => {
	const r = repoOf(c);
	me(c);
	const b = await c.body<{ title: string; body?: string; labels?: number[]; assignees?: string[]; milestone?: number }>();
	return issueJson(c.db, c.origin, repoRef(r), createIssue(c, r, b));
});
route('GET', '/repos/:owner/:repo/issues/:index', (c) => {
	const r = repoOf(c);
	return issueJson(c.db, c.origin, repoRef(r), issueOf(c, r));
});

export async function editIssue(c: Ctx, r: RepoCtx, i: IssueRow, b: { title?: string; body?: string; state?: string; assignees?: string[]; milestone?: number | null; due_date?: string | null; unset_due_date?: boolean }) {
	const u = me(c);
	if (!canEdit(c, r, i)) error(403, "You can't edit this");
	const triage = atLeast(r.level, 'write');
	if (b.title !== undefined && b.title.trim() && b.title.trim() !== i.title) {
		c.db.query('update issues set title = ? where id = ?').run(b.title.trim(), i.id);
		event(c.db, i.id, u.id, 'change_title', { old_title: i.title, new_title: b.title.trim() });
	}
	if (b.body !== undefined && b.body !== i.body) c.db.query("update issues set body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(b.body, i.id);
	if (b.state && b.state !== i.state) {
		if (i.is_pull && c.db.query<{ m: string | null }, [number]>('select merged_at as m from pulls where issue_id = ?').get(i.id)?.m) error(422, 'A merged pull request stays closed');
		const closed = b.state === 'closed';
		c.db.query('update issues set state = ?, closed_at = ? where id = ?').run(closed ? 'closed' : 'open', closed ? now() : null, i.id);
		event(c.db, i.id, u.id, closed ? 'close' : 'reopen');
		record(c.db, { userId: u.id, repoId: r.row.id, op: `${closed ? 'close' : 'reopen'}_${i.is_pull ? 'pull_request' : 'issue'}`, content: JSON.stringify([String(i.number), i.title]) });
		notify(c, r, i, closed ? 'closed it' : 'reopened it', '');
		if (i.is_pull) {
			const { refreshPull, pullById } = await import('./pulls.js');
			if (!closed) await refreshPull(c, r, i.id);
			const { pullEvent } = await import('../actions/runs.js');
			await pullEvent(c.db, c.root, c.origin, r.row, pullById(c, i.id), closed ? 'closed' : 'reopened', u.id);
		}
	}
	if (triage && b.assignees) {
		const want = new Set<number>();
		for (const login of b.assignees) want.add((userByLogin(c.db, login) ?? error(422, `No user called ${login}`)).id);
		const have = new Set(c.db.query<{ user_id: number }, [number]>('select user_id from assignees where issue_id = ?').all(i.id).map((a) => a.user_id));
		for (const id of want)
			if (!have.has(id)) {
				c.db.query('insert into assignees (issue_id, user_id) values (?, ?)').run(i.id, id);
				event(c.db, i.id, u.id, 'assignees', { assignee: id, removed: false });
				c.db.query('insert or ignore into subscriptions (user_id, issue_id) values (?, ?)').run(id, i.id);
			}
		for (const id of have)
			if (!want.has(id)) {
				c.db.query('delete from assignees where issue_id = ? and user_id = ?').run(i.id, id);
				event(c.db, i.id, u.id, 'assignees', { assignee: id, removed: true });
			}
	}
	if (triage && b.milestone !== undefined && (b.milestone || null) !== i.milestone_id) {
		const m = b.milestone ? (c.db.query<{ id: number }, [number, number]>('select id from milestones where id = ? and repo_id = ?').get(b.milestone, r.row.id) ?? error(422, 'No such milestone')).id : null;
		c.db.query('update issues set milestone_id = ? where id = ?').run(m, i.id);
		event(c.db, i.id, u.id, 'milestone', { milestone: m, old_milestone: i.milestone_id });
	}
	if (triage && (b.due_date !== undefined || b.unset_due_date)) c.db.query('update issues set due_on = ? where id = ?').run(b.unset_due_date ? null : (b.due_date ?? null), i.id);
	touch(c.db, i.id);
	return c.db.query<IssueRow, [number]>('select * from issues where id = ?').get(i.id)!;
}
route('PATCH', '/repos/:owner/:repo/issues/:index', async (c) => {
	const r = repoOf(c);
	return issueJson(c.db, c.origin, repoRef(r), await editIssue(c, r, issueOf(c, r), await c.body()));
});
route('DELETE', '/repos/:owner/:repo/issues/:index', (c) => {
	const r = repoOf(c, 'admin');
	c.db.query('delete from issues where id = ?').run(issueOf(c, r).id);
});
for (const [m, lock] of [
	['PUT', 1],
	['DELETE', 0]
] as const)
	route(m, '/repos/:owner/:repo/issues/:index/lock', (c) => {
		const r = repoOf(c, 'write');
		const i = issueOf(c, r);
		c.db.query('update issues set locked = ? where id = ?').run(lock, i.id);
		event(c.db, i.id, me(c).id, lock ? 'lock' : 'unlock');
	});
for (const [m, pin] of [
	['POST', 1],
	['DELETE', 0]
] as const)
	route(m, '/repos/:owner/:repo/issues/:index/pin', (c) => {
		const r = repoOf(c, 'write');
		c.db.query('update issues set pinned = ? where id = ?').run(pin, issueOf(c, r).id);
	});

// --- labels on an issue ---

function setLabels(c: Ctx, r: RepoCtx, i: IssueRow, ids: number[], mode: 'add' | 'replace') {
	if (!atLeast(r.level, 'write')) error(403, 'Labelling needs write access');
	const u = me(c);
	const have = new Set(c.db.query<{ label_id: number }, [number]>('select label_id from issue_labels where issue_id = ?').all(i.id).map((x) => x.label_id));
	const want = new Set(ids.filter((id) => c.db.query('select 1 from labels where id = ? and repo_id = ?').get(id, r.row.id)));
	for (const id of want) if (!have.has(id)) c.db.query('insert into issue_labels (issue_id, label_id) values (?, ?)').run(i.id, id), event(c.db, i.id, u.id, 'label', { label: id, added: true });
	if (mode === 'replace') for (const id of have) if (!want.has(id)) c.db.query('delete from issue_labels where issue_id = ? and label_id = ?').run(i.id, id), event(c.db, i.id, u.id, 'label', { label: id, added: false });
	return c.db.query<LabelRow, [number]>('select l.* from labels l join issue_labels il on il.label_id = l.id where il.issue_id = ? order by l.name').all(i.id).map(labelJson);
}
// Labels may come as ids or names.
const labelIds = (c: Ctx, r: RepoCtx, v: (number | string)[] = []) =>
	v.map((x) => (typeof x === 'number' ? x : (c.db.query<{ id: number }, [number, string]>('select id from labels where repo_id = ? and name = ?').get(r.row.id, x)?.id ?? -1)));
route('GET', '/repos/:owner/:repo/issues/:index/labels', (c) => {
	const r = repoOf(c);
	return c.db.query<LabelRow, [number]>('select l.* from labels l join issue_labels il on il.label_id = l.id where il.issue_id = ? order by l.name').all(issueOf(c, r).id).map(labelJson);
});
route('POST', '/repos/:owner/:repo/issues/:index/labels', async (c) => {
	const r = repoOf(c);
	return setLabels(c, r, issueOf(c, r), labelIds(c, r, (await c.body<{ labels: (number | string)[] }>()).labels), 'add');
});
route('PUT', '/repos/:owner/:repo/issues/:index/labels', async (c) => {
	const r = repoOf(c);
	return setLabels(c, r, issueOf(c, r), labelIds(c, r, (await c.body<{ labels: (number | string)[] }>()).labels), 'replace');
});
route('DELETE', '/repos/:owner/:repo/issues/:index/labels/:id', (c) => {
	const r = repoOf(c);
	const i = issueOf(c, r);
	const keep = c.db.query<{ label_id: number }, [number]>('select label_id from issue_labels where issue_id = ?').all(i.id).map((x) => x.label_id).filter((x) => x !== Number(c.params.id));
	setLabels(c, r, i, keep, 'replace');
});
route('DELETE', '/repos/:owner/:repo/issues/:index/labels', (c) => {
	const r = repoOf(c);
	setLabels(c, r, issueOf(c, r), [], 'replace');
});

// --- comments ---

export function addComment(c: Ctx, r: RepoCtx, i: IssueRow, body: string) {
	const u = me(c);
	if (!body.trim()) error(422, 'Comment is empty');
	if (i.locked && !atLeast(r.level, 'write')) error(403, 'This conversation is locked');
	const id = Number(c.db.query('insert into comments (issue_id, user_id, body) values (?, ?, ?)').run(i.id, u.id, body).lastInsertRowid);
	touch(c.db, i.id);
	c.db.query('insert or ignore into subscriptions (user_id, issue_id) values (?, ?)').run(u.id, i.id);
	record(c.db, { userId: u.id, repoId: r.row.id, op: i.is_pull ? 'comment_pull' : 'comment_issue', content: JSON.stringify([String(i.number), body.split('\n')[0].slice(0, 200)]) });
	notify(c, r, i, 'commented', body);
	crossReference(c, r, i, body);
	return c.db.query<CommentRow, [number]>('select * from comments where id = ?').get(id)!;
}
route('GET', '/repos/:owner/:repo/issues/:index/comments', (c) => {
	const r = repoOf(c);
	const i = issueOf(c, r);
	return c.db.query<CommentRow, [number]>('select * from comments where issue_id = ? and review_id is null order by id').all(i.id).map((x) => commentJson(c.db, c.origin, r.full, i.number, x));
});
route('POST', '/repos/:owner/:repo/issues/:index/comments', async (c) => {
	const r = repoOf(c);
	const i = issueOf(c, r);
	return commentJson(c.db, c.origin, r.full, i.number, addComment(c, r, i, (await c.body<{ body: string }>()).body ?? ''));
});
function commentOf(c: Ctx, r: RepoCtx) {
	return (
		c.db.query<CommentRow & { number: number }, [number, number]>('select cm.*, i.number from comments cm join issues i on i.id = cm.issue_id where cm.id = ? and i.repo_id = ?').get(Number(c.params.id), r.row.id) ??
		error(404, 'Comment not found')
	);
}
route('GET', '/repos/:owner/:repo/issues/comments/:id', (c) => {
	const r = repoOf(c);
	const x = commentOf(c, r);
	return commentJson(c.db, c.origin, r.full, x.number, x);
});
route('PATCH', '/repos/:owner/:repo/issues/comments/:id', async (c) => {
	const r = repoOf(c);
	const x = commentOf(c, r);
	if (x.user_id !== me(c).id && !atLeast(r.level, 'admin')) error(403, "You can only edit your own comments");
	const body = (await c.body<{ body: string }>()).body ?? '';
	c.db.query("update comments set body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(body, x.id);
	return commentJson(c.db, c.origin, r.full, x.number, { ...x, body });
});
route('DELETE', '/repos/:owner/:repo/issues/comments/:id', (c) => {
	const r = repoOf(c);
	const x = commentOf(c, r);
	if (x.user_id !== me(c).id && !atLeast(r.level, 'admin')) error(403, "You can only delete your own comments");
	c.db.query('delete from comments where id = ?').run(x.id);
});

// --- reactions ---

const REACTIONS = new Set(['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes']);
function reactions(c: Ctx, where: string, id: number) {
	return c.db
		.query<{ content: string; user_id: number; created_at: string }, [number]>(`select content, user_id, created_at from reactions where ${where} = ? order by id`)
		.all(id)
		.map((x) => ({ content: x.content, user: userJson(c.db, x.user_id), created_at: x.created_at }));
}
async function react(c: Ctx, where: 'issue_id' | 'comment_id', id: number, add: boolean) {
	const content = (await c.body<{ content: string }>()).content;
	if (!REACTIONS.has(content)) error(422, `Reaction must be one of ${[...REACTIONS].join(' ')}`);
	const u = me(c);
	// The unique index can't catch repeats: the unused id column is null, and nulls never collide.
	const had = c.db.query(`select 1 from reactions where ${where} = ? and user_id = ? and content = ?`).get(id, u.id, content);
	if (add && !had) c.db.query(`insert into reactions (${where}, user_id, content) values (?, ?, ?)`).run(id, u.id, content);
	if (!add) c.db.query(`delete from reactions where ${where} = ? and user_id = ? and content = ?`).run(id, u.id, content);
	return add ? { content, user: toUser(u), created_at: now() } : undefined;
}
route('GET', '/repos/:owner/:repo/issues/comments/:id/reactions', (c) => {
	const x = commentOf(c, repoOf(c));
	const list = reactions(c, 'comment_id', x.id);
	return list.length ? list : null;
});
route('POST', '/repos/:owner/:repo/issues/comments/:id/reactions', (c) => react(c, 'comment_id', commentOf(c, repoOf(c)).id, true));
route('DELETE', '/repos/:owner/:repo/issues/comments/:id/reactions', (c) => react(c, 'comment_id', commentOf(c, repoOf(c)).id, false));
route('GET', '/repos/:owner/:repo/issues/:index/reactions', (c) => {
	const r = repoOf(c);
	return reactions(c, 'issue_id', issueOf(c, r).id);
});
route('POST', '/repos/:owner/:repo/issues/:index/reactions', (c) => {
	const r = repoOf(c);
	return react(c, 'issue_id', issueOf(c, r).id, true);
});
route('DELETE', '/repos/:owner/:repo/issues/:index/reactions', (c) => {
	const r = repoOf(c);
	return react(c, 'issue_id', issueOf(c, r).id, false);
});

// --- subscriptions ---

route('GET', '/repos/:owner/:repo/issues/:index/subscriptions/check', (c) => {
	const r = repoOf(c);
	const s = c.db.query<{ subscribed: number }, [number, number]>('select subscribed from subscriptions where user_id = ? and issue_id = ?').get(me(c).id, issueOf(c, r).id);
	return { subscribed: !!s?.subscribed, ignored: s ? !s.subscribed : false };
});
for (const [m, on] of [
	['PUT', 1],
	['DELETE', 0]
] as const)
	route(m, '/repos/:owner/:repo/issues/:index/subscriptions/:user', (c) => {
		const r = repoOf(c);
		const u = me(c);
		if (c.params.user !== u.login) error(403, 'You can only change your own subscription');
		c.db.query('insert into subscriptions (user_id, issue_id, subscribed) values (?, ?, ?) on conflict do update set subscribed = excluded.subscribed').run(u.id, issueOf(c, r).id, on);
	});

// --- timeline ---

type EventRow = { id: number; user_id: number; kind: string; data: string; created_at: string };
route('GET', '/repos/:owner/:repo/issues/:index/timeline', (c) => {
	const r = repoOf(c);
	const i = issueOf(c, r);
	const label = (id: number) => {
		const l = c.db.query<LabelRow, [number]>('select * from labels where id = ?').get(id);
		return l ? labelJson(l) : null;
	};
	const milestone = (id: number | null) => {
		const m = id ? c.db.query<MilestoneRow, [number]>('select * from milestones where id = ?').get(id) : null;
		return m ? milestoneJson(c.db, m) : null;
	};
	const items = [
		...c.db.query<CommentRow, [number]>('select * from comments where issue_id = ? and review_id is null').all(i.id).map((x) => ({ ...commentJson(c.db, c.origin, r.full, i.number, x), type: 'comment', at: x.created_at })),
		...c.db.query<EventRow, [number]>('select * from events where issue_id = ?').all(i.id).map((e) => {
			const d = JSON.parse(e.data);
			const base = { id: e.id + 1e9, type: e.kind, user: userJson(c.db, e.user_id), created_at: e.created_at, body: '', at: e.created_at };
			if (e.kind === 'label') return { ...base, label: label(d.label), body: d.added ? '1' : '0' };
			if (e.kind === 'change_title') return { ...base, old_title: d.old_title, new_title: d.new_title };
			if (e.kind === 'assignees') return { ...base, assignee: userJson(c.db, d.assignee), removed_assignee: !!d.removed };
			if (e.kind === 'milestone') return { ...base, milestone: milestone(d.milestone), old_milestone: milestone(d.old_milestone) };
			if (e.kind === 'review_request') return { ...base, assignee: userJson(c.db, d.reviewer), removed_assignee: !!d.removed };
			return { ...base, ...d };
		})
	].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
	return items.map(({ at: _, ...x }) => x);
});

// --- cross references: "#12" or "owner/repo#12" in a comment adds an event to the issue it names ---

export function crossReference(c: Ctx, r: RepoCtx, from: IssueRow, text: string) {
	const plain = text.replace(/```[\s\S]*?```|`[^`]*`/g, '');
	const seen = new Set<number>();
	for (const m of plain.matchAll(/(?:^|[\s(])(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/g)) {
		const repoRow = m[1]
			? c.db.query<RepoRow, [string, string]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where u.login = ? and r.name = ?').get(m[1], m[2])
			: r.row;
		if (!repoRow || !atLeast(access(c.db, c.user?.id, repoRow), 'read')) continue;
		const target = c.db.query<IssueRow, [number, number]>('select * from issues where repo_id = ? and number = ?').get(repoRow.id, Number(m[3]));
		if (!target || target.id === from.id || seen.has(target.id)) continue;
		seen.add(target.id);
		event(c.db, target.id, me(c).id, from.is_pull ? 'pull_ref' : 'issue_ref', { ref_repo: r.full, ref_number: from.number, ref_title: from.title, ref_is_pull: !!from.is_pull });
	}
}

export type { UserRow };
