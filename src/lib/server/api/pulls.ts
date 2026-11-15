import { error } from '@sveltejs/kit';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parseDiff } from '../../diff.js';
import { access, atLeast, tokenAccess } from '../access.js';
import { type UserRow } from '../accounts.js';
import { record } from '../activity.js';
import * as browse from '../browse.js';
import { git, gitTry, spawn } from '../git.js';
import { afterPush, onPush, refSnapshot } from '../push.js';
import { repoDir, type RepoRow } from '../repos.js';
import { now, refSha, repoOf, slice, userByLogin, userJson, userRow, type RepoCtx } from './common.js';
import { addComment, createIssue, crossReference, event, issueOf, repoRef, touch } from './issues.js';
import { notify } from './notify.js';
import { checkRefWrite, protectionFor } from './protect.js';
import { commitsJson } from './repos.js';
import { me, page, Paged, route, type Ctx } from './router.js';
import { reviewCommentJson, reviewJson, issueJson, type CommentRow, type PullRow, type ReviewRow } from './shapes.js';
import { combinedStatus, latest, onStatus, overall } from './statuses.js';
import { onCiStatus, pullEvent } from '../actions/runs.js';

const Z = '0'.repeat(40);
const SELECT = 'select i.*, p.* from issues i join pulls p on p.issue_id = i.id';
const REPO = 'select r.*, u.login as owner from repos r join users u on u.id = r.owner_id';

export function pullOf(c: Ctx, r: RepoCtx, number = Number(c.params.index)) {
	return c.db.query<PullRow, [number, number]>(`${SELECT} where i.repo_id = ? and i.number = ?`).get(r.row.id, number) ?? error(404, `Pull request #${number} not found`);
}
export const pullById = (c: Ctx, id: number) => c.db.query<PullRow, [number]>(`${SELECT} where i.id = ?`).get(id)!;

// Where the head branch lives: the PR's own repo, or a fork.
function headDir(c: Ctx, r: RepoCtx, p: PullRow) {
	return p.head_repo_id && p.head_repo_id !== r.row.id ? repoDir(c.root, p.head_repo_id) : r.dir;
}

// Fork heads are fetched into the base repo as refs/pull/N/head, so every diff and merge works inside one repo.
async function syncHeadRef(c: Ctx, r: RepoCtx, p: PullRow) {
	if (p.head_repo_id && p.head_repo_id !== r.row.id) await git(r.dir, ['fetch', '--quiet', '--no-tags', repoDir(c.root, p.head_repo_id), `+refs/heads/${p.head}:refs/pull/${p.number}/head`]);
	else await git(r.dir, ['update-ref', `refs/pull/${p.number}/head`, p.head_sha]);
}

const mergeableCache = new Map<string, boolean>();
export async function mergeable(dir: string, base: string, head: string) {
	const key = `${dir}:${base}:${head}`;
	if (!mergeableCache.has(key)) {
		const p = spawn(['--git-dir', dir, 'merge-tree', '--write-tree', '--name-only', '--no-messages', base, head]);
		await new Response(p.stdout).text();
		mergeableCache.set(key, (await p.exited) === 0);
		if (mergeableCache.size > 5000) mergeableCache.clear();
	}
	return mergeableCache.get(key)!;
}

async function diffStats(dir: string, base: string, head: string) {
	const out = await git(dir, ['diff', '--numstat', base, head]);
	const rows = out.split('\n').filter(Boolean).map((l) => l.split('\t'));
	return { changed_files: rows.length, additions: rows.reduce((n, r) => n + (Number(r[0]) || 0), 0), deletions: rows.reduce((n, r) => n + (Number(r[1]) || 0), 0) };
}

export async function pullJson(c: Ctx, r: RepoCtx, p: PullRow) {
	const issue = issueJson(c.db, c.origin, repoRef(r), p);
	const baseSha = (await refSha(r.dir, `refs/heads/${p.base}`)) ?? p.merge_base ?? '';
	const mb = p.merge_base ?? baseSha;
	const stats = mb ? await diffStats(r.dir, mb, p.head_sha).catch(() => ({ changed_files: 0, additions: 0, deletions: 0 })) : { changed_files: 0, additions: 0, deletions: 0 };
	const headRepo = p.head_repo_id && p.head_repo_id !== r.row.id ? c.db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(p.head_repo_id) : r.row;
	const headFull = headRepo ? `${headRepo.owner}/${headRepo.name}` : r.full;
	const reviewers = c.db.query<UserRow, [number]>('select u.* from users u join review_requests rr on rr.user_id = u.id where rr.issue_id = ?').all(p.id);
	return {
		...issue,
		html_url: `${c.origin}/${r.full}/pulls/${p.number}`,
		diff_url: `${c.origin}/${r.full}/pulls/${p.number}.diff`,
		patch_url: `${c.origin}/${r.full}/pulls/${p.number}.patch`,
		draft: !!p.draft,
		merged: !!p.merged_at,
		merged_at: p.merged_at,
		merged_by: userJson(c.db, p.merged_by),
		merge_commit_sha: p.merge_commit,
		mergeable: !p.merged_at && p.state === 'open' && !!baseSha && (await mergeable(r.dir, baseSha, p.head_sha)),
		merge_base: p.merge_base,
		head: { ref: p.head, label: headRepo && headRepo.id !== r.row.id ? `${headRepo.owner}:${p.head}` : p.head, sha: p.head_sha, repo_id: headRepo?.id, repo: { full_name: headFull } },
		base: { ref: p.base, label: p.base, sha: baseSha, repo_id: r.row.id, repo: { full_name: r.full } },
		requested_reviewers: reviewers.map((u) => userJson(c.db, u.id)),
		allow_maintainer_edit: true,
		review_comments: c.db.query<{ n: number }, [number]>('select count(*) as n from comments where issue_id = ? and review_id is not null').get(p.id)!.n,
		auto_merge: p.auto_merge ? { style: p.auto_merge, by: userJson(c.db, p.auto_merge_by) } : null,
		...stats
	};
}

// --- opening ---

route('POST', '/repos/:owner/:repo/pulls', async (c) => {
	const r = repoOf(c);
	const u = me(c);
	const b = await c.body<{ head: string; base?: string; title: string; body?: string; draft?: boolean; labels?: number[]; assignees?: string[]; milestone?: number; reviewers?: string[] }>();
	const base = b.base || r.row.default_branch;
	// "owner:branch" names a branch in a fork.
	let headRepo = r.row;
	let head = b.head ?? '';
	if (head.includes(':')) {
		const [owner, branch] = head.split(':');
		const fork = c.db.query<RepoRow, [string, number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where u.login = ? and r.fork_of = ?').get(owner, r.row.id);
		if (owner !== r.row.owner) {
			if (!fork || !atLeast(access(c.db, u.id, fork), 'read')) error(404, `${owner} has no fork of ${r.full}`);
			headRepo = fork;
		}
		head = branch;
	}
	const hdir = repoDir(c.root, headRepo.id);
	const headSha = (await refSha(hdir, `refs/heads/${head}`)) ?? error(404, `There's no branch called ${head}`);
	const baseSha = (await refSha(r.dir, `refs/heads/${base}`)) ?? error(404, `There's no branch called ${base}`);
	if (headRepo.id === r.row.id && head === base) error(422, 'The head and base branches are the same');
	const open = c.db.query(`${SELECT} where i.repo_id = ? and i.state = 'open' and p.head = ? and p.base = ? and coalesce(p.head_repo_id, i.repo_id) = ?`).get(r.row.id, head, base, headRepo.id);
	if (open) error(409, `There's already an open pull request from ${head} into ${base}`);
	if (headRepo.id !== r.row.id) await git(r.dir, ['fetch', '--quiet', '--no-tags', hdir, `+refs/heads/${head}:refs/shed/tmp/${u.id}`]);
	const mb = await browse.mergeBase(r.dir, baseSha, headSha);
	if (mb === headSha) error(422, `${head} has no commits that ${base} doesn't`);
	const issue = createIssue(c, r, { title: b.title, body: b.body, labels: b.labels, assignees: b.assignees, milestone: b.milestone }, true);
	c.db
		.query('insert into pulls (issue_id, base, head, head_repo_id, head_sha, merge_base, draft) values (?, ?, ?, ?, ?, ?, ?)')
		.run(issue.id, base, head, headRepo.id === r.row.id ? null : headRepo.id, headSha, mb, b.draft || /^(wip|draft)[:\]]|^\[wip\]/i.test(b.title) ? 1 : 0);
	c.db.query('insert into revisions (issue_id, head_sha, base_sha, user_id) values (?, ?, ?, ?)').run(issue.id, headSha, baseSha, u.id);
	const p = pullById(c, issue.id);
	await syncHeadRef(c, r, p);
	if (headRepo.id !== r.row.id) await git(r.dir, ['update-ref', '-d', `refs/shed/tmp/${u.id}`]);
	for (const login of b.reviewers ?? []) requestReview(c, r, p, login, false);
	crossReference(c, r, p, b.body ?? '');
	await pullEvent(c.db, c.root, c.origin, r.row, p, 'opened', u.id);
	return pullJson(c, r, p);
});

// --- reading ---

route('GET', '/repos/:owner/:repo/pulls', async (c) => {
	const r = repoOf(c);
	const q = c.url.searchParams;
	const state = q.get('state') ?? 'open';
	const where = ['i.repo_id = ?'];
	const args: (string | number)[] = [r.row.id];
	if (state !== 'all') where.push('i.state = ?'), args.push(state === 'closed' ? 'closed' : 'open');
	for (const l of q.getAll('labels').flatMap((x) => x.split(',')).filter(Boolean))
		where.push('exists (select 1 from issue_labels il join labels lb on lb.id = il.label_id where il.issue_id = i.id and (lb.id = ? or lb.name = ?))'), args.push(Number(l) || -1, l);
	const ms = q.get('milestone');
	if (ms) where.push('i.milestone_id = ?'), args.push(Number(ms));
	const poster = q.get('poster');
	if (poster) where.push('i.user_id = (select id from users where login = ?)'), args.push(poster);
	const sort = { oldest: 'i.created_at asc', recentupdate: 'i.updated_at desc', leastupdate: 'i.updated_at asc', mostcomment: '(select count(*) from comments where issue_id = i.id) desc' }[q.get('sort') ?? ''] ?? 'i.created_at desc';
	const rows = c.db.query<PullRow, (string | number)[]>(`${SELECT} where ${where.join(' and ')} order by i.pinned desc, ${sort}`).all(...args);
	return new Paged(await Promise.all(slice(rows, page(c)).map((p) => pullJson(c, r, p))), rows.length);
});
route('GET', '/repos/:owner/:repo/pulls/:index', async (c) => {
	const r = repoOf(c);
	const m = c.params.index.match(/^(\d+)\.(diff|patch)$/);
	if (m) {
		const p = pullOf(c, r, Number(m[1]));
		const base = p.merge_base ?? (await refSha(r.dir, `refs/heads/${p.base}`))!;
		const text = m[2] === 'diff' ? await browse.diff(r.dir, base, p.head_sha) : await git(r.dir, ['format-patch', '--stdout', `${base}..${p.head_sha}`]);
		return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
	return pullJson(c, r, pullOf(c, r));
});
route('GET', '/repos/:owner/:repo/pulls/:base/*head', async (c) => {
	const r = repoOf(c);
	const p = c.db.query<PullRow, [number, string, string]>(`${SELECT} where i.repo_id = ? and p.base = ? and p.head = ? order by i.id desc`).get(r.row.id, c.params.base, c.params.head) ?? error(404, 'No such pull request');
	return pullJson(c, r, p);
});
route('GET', '/repos/:owner/:repo/pulls/:index/commits', async (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const base = p.merge_base ?? (await refSha(r.dir, `refs/heads/${p.base}`))!;
	const shas = (await git(r.dir, ['rev-list', '--reverse', `${base}..${p.head_sha}`])).split('\n').filter(Boolean);
	const pg = page(c, 50);
	const list = await Promise.all(slice(shas, pg).map((s) => browse.commit(r.dir, s)));
	return new Paged(commitsJson(c, r.full, list), shas.length);
});
route('GET', '/repos/:owner/:repo/pulls/:index/files', async (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const base = p.merge_base ?? (await refSha(r.dir, `refs/heads/${p.base}`))!;
	const files = parseDiff(await browse.diff(r.dir, base, p.head_sha)).map((f) => ({
		filename: f.status === 'deleted' ? f.from : f.to,
		previous_filename: f.status === 'renamed' ? f.from : undefined,
		status: { added: 'added', deleted: 'deleted', renamed: 'renamed', modified: 'changed' }[f.status],
		additions: f.additions,
		deletions: f.deletions,
		changes: f.additions + f.deletions
	}));
	return new Paged(slice(files, page(c, 200)), files.length);
});
// Every push to the PR, newest last; Shed's own endpoint (Forgejo has none).
route('GET', '/repos/:owner/:repo/pulls/:index/revisions', (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	return c.db
		.query<{ id: number; head_sha: string; before_sha: string | null; base_sha: string | null; user_id: number | null; forced: number; created_at: string }, [number]>('select * from revisions where issue_id = ? order by id')
		.all(p.id)
		.map((x) => ({ ...x, forced: !!x.forced, user: userJson(c.db, x.user_id) }));
});

// --- editing ---

route('PATCH', '/repos/:owner/:repo/pulls/:index', async (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const b = await c.body<{ title?: string; body?: string; state?: string; base?: string; draft?: boolean; assignees?: string[]; milestone?: number; labels?: number[] }>();
	const { editIssue } = await import('./issues.js');
	await editIssue(c, r, p, b);
	if (b.base && b.base !== p.base) {
		if (!atLeast(r.level, 'write')) error(403, 'Changing the base needs write access');
		const baseSha = (await refSha(r.dir, `refs/heads/${b.base}`)) ?? error(404, `There's no branch called ${b.base}`);
		c.db.query('update pulls set base = ?, merge_base = ? where issue_id = ?').run(b.base, await browse.mergeBase(r.dir, baseSha, p.head_sha), p.id);
		event(c.db, p.id, me(c).id, 'change_target_branch', { old_ref: p.base, new_ref: b.base });
	}
	const draft = b.draft ?? (b.title !== undefined ? /^(wip|draft)[:\]]|^\[wip\]/i.test(b.title) : undefined);
	if (draft !== undefined && +draft !== p.draft) {
		c.db.query('update pulls set draft = ? where issue_id = ?').run(+draft, p.id);
		event(c.db, p.id, me(c).id, draft ? 'draft' : 'ready_for_review');
	}
	return pullJson(c, r, pullById(c, p.id));
});

// Re-reads the head and merge base, e.g. after a reopen.
export async function refreshPull(c: Ctx, r: RepoCtx, issueId: number) {
	const p = pullById(c, issueId);
	const sha = await refSha(headDir(c, r, p), `refs/heads/${p.head}`);
	const baseSha = await refSha(r.dir, `refs/heads/${p.base}`);
	if (!sha || !baseSha) return;
	c.db.query('update pulls set head_sha = ?, merge_base = ? where issue_id = ?').run(sha, await browse.mergeBase(r.dir, baseSha, sha).catch(() => null), p.id);
	await syncHeadRef(c, r, pullById(c, issueId));
}

// --- reviews ---

route('GET', '/repos/:owner/:repo/pulls/:index/reviews', (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const uid = c.user?.id ?? -1;
	// Pending (draft) reviews are only visible to their author.
	return c.db.query<ReviewRow, [number, number]>("select * from reviews where issue_id = ? and (state != 'PENDING' or user_id = ?) order by id").all(p.id, uid).map((x) => reviewJson(c.db, x, p.head_sha));
});
const reviewOf = (c: Ctx, p: PullRow) => c.db.query<ReviewRow, [number, number]>('select * from reviews where id = ? and issue_id = ?').get(Number(c.params.id), p.id) ?? error(404, 'Review not found');
route('GET', '/repos/:owner/:repo/pulls/:index/reviews/:id', (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	return reviewJson(c.db, reviewOf(c, p), p.head_sha);
});
route('GET', '/repos/:owner/:repo/pulls/:index/reviews/:id/comments', (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const rv = reviewOf(c, p);
	return c.db.query<CommentRow, [number]>('select * from comments where review_id = ? order by id').all(rv.id).map((x) => reviewCommentJson(c.db, c.origin, r.full, p.number, x));
});
// Every line comment on the PR in one call (Shed's own; Forgejo needs one call per review).
route('GET', '/repos/:owner/:repo/pulls/:index/comments', (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	return c.db
		.query<CommentRow, [number]>("select cm.* from comments cm join reviews rv on rv.id = cm.review_id where cm.issue_id = ? and rv.state != 'PENDING' order by cm.id")
		.all(p.id)
		.map((x) => reviewCommentJson(c.db, c.origin, r.full, p.number, x));
});

// The hunk header plus the lines up to the commented one, as the comment's anchor if the code later changes.
function hunkFor(diff: string, path: string, side: 'old' | 'new', line: number) {
	for (const f of parseDiff(diff)) {
		if (f.to !== path && f.from !== path) continue;
		for (const h of f.hunks) {
			const i = h.lines.findIndex((l) => l[side] === line);
			if (i < 0) continue;
			return [h.header, ...h.lines.slice(Math.max(0, i - 3), i + 1).map((l) => (l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ') + l.text)].join('\n');
		}
	}
	return null;
}

type DraftComment = { path: string; body: string; new_position?: number; old_position?: number; line?: number; side?: 'old' | 'new' };

async function submitReview(c: Ctx, r: RepoCtx, p: PullRow, b: { event?: string; body?: string; comments?: DraftComment[]; commit_id?: string }) {
	const u = me(c);
	const ev = (b.event ?? 'COMMENT').toUpperCase().replace('APPROVE', 'APPROVED').replace('APPROVEDD', 'APPROVED');
	const state = { APPROVED: 'APPROVED', REQUEST_CHANGES: 'REQUEST_CHANGES', COMMENT: 'COMMENT', PENDING: 'PENDING' }[ev] ?? error(422, `Unknown review event ${b.event}`);
	if ((state === 'APPROVED' || state === 'REQUEST_CHANGES') && p.user_id === u.id) error(422, `You can't ${state === 'APPROVED' ? 'approve' : 'request changes on'} your own pull request`);
	if ((state === 'APPROVED' || state === 'REQUEST_CHANGES') && !atLeast(r.level, 'write') && !c.db.query('select 1 from review_requests where issue_id = ? and user_id = ?').get(p.id, u.id))
		error(403, 'Only people with write access, or asked to review, can approve or request changes');
	if (state === 'COMMENT' && !b.body?.trim() && !b.comments?.length) error(422, 'A comment review needs a comment');
	if (p.locked && !atLeast(r.level, 'write')) error(403, 'This conversation is locked');
	const commit = b.commit_id && /^[0-9a-f]{40}$/.test(b.commit_id) ? b.commit_id : p.head_sha;
	const base = p.merge_base ?? (await refSha(r.dir, `refs/heads/${p.base}`))!;
	const diff = b.comments?.length ? await browse.diff(r.dir, base, commit) : '';
	const id = c.db.transaction(() => {
		// A pending review collects line comments until it's submitted; submitting reuses it.
		const pending = c.db.query<ReviewRow, [number, number]>("select * from reviews where issue_id = ? and user_id = ? and state = 'PENDING'").get(p.id, u.id);
		const id = pending
			? (c.db.query("update reviews set state = ?, body = ?, commit_sha = ?, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(state, b.body ?? '', commit, pending.id), pending.id)
			: Number(c.db.query('insert into reviews (issue_id, user_id, state, body, commit_sha) values (?, ?, ?, ?, ?)').run(p.id, u.id, state, b.body ?? '', commit).lastInsertRowid);
		for (const x of b.comments ?? []) {
			const side = x.side ?? (x.old_position && !x.new_position ? 'old' : 'new');
			const line = x.line ?? (side === 'old' ? x.old_position : x.new_position);
			if (!x.path || !line) error(422, 'Line comments need a path and a line');
			const hunk = hunkFor(diff, x.path, side, line);
			if (!hunk) error(422, `Line ${line} of ${x.path} isn't in this pull request's diff`);
			c.db.query('insert into comments (issue_id, user_id, body, review_id, path, side, line, commit_sha, diff_hunk) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(p.id, u.id, x.body, id, x.path, side, line, commit, hunk);
		}
		if (state !== 'PENDING') c.db.query('delete from review_requests where issue_id = ? and user_id = ?').run(p.id, u.id);
		return id;
	})();
	if (state !== 'PENDING') {
		touch(c.db, p.id);
		c.db.query('insert or ignore into subscriptions (user_id, issue_id) values (?, ?)').run(u.id, p.id);
		const op = { APPROVED: 'approve_pull_request', REQUEST_CHANGES: 'reject_pull_request', COMMENT: 'comment_pull' }[state]!;
		record(c.db, { userId: u.id, repoId: r.row.id, op, content: JSON.stringify([String(p.number), (b.body ?? '').split('\n')[0]]) });
		notify(c, r, p, 'reviewed', [b.body ?? '', ...(b.comments ?? []).map((x) => x.body)].join('\n'));
		await tryAutoMerge(c, r, p.id);
	}
	return reviewJson(c.db, c.db.query<ReviewRow, [number]>('select * from reviews where id = ?').get(id)!, p.head_sha);
}
route('POST', '/repos/:owner/:repo/pulls/:index/reviews', async (c) => {
	const r = repoOf(c);
	return submitReview(c, r, pullOf(c, r), await c.body());
});
route('POST', '/repos/:owner/:repo/pulls/:index/reviews/:id', async (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	if (reviewOf(c, p).user_id !== me(c).id) error(403, 'Not your review');
	return submitReview(c, r, p, await c.body());
});
route('DELETE', '/repos/:owner/:repo/pulls/:index/reviews/:id', (c) => {
	const r = repoOf(c);
	const rv = reviewOf(c, pullOf(c, r));
	if (rv.user_id !== me(c).id || rv.state !== 'PENDING') error(422, 'Only your own pending review can be deleted');
	c.db.query('delete from reviews where id = ?').run(rv.id);
});
route('POST', '/repos/:owner/:repo/pulls/:index/reviews/:id/dismissals', async (c) => {
	const r = repoOf(c, 'write');
	const p = pullOf(c, r);
	const rv = reviewOf(c, p);
	c.db.query('update reviews set dismissed = 1 where id = ?').run(rv.id);
	event(c.db, p.id, me(c).id, 'dismiss_review', { review: rv.id, reviewer: rv.user_id, message: (await c.body<{ message?: string }>()).message ?? '' });
	return reviewJson(c.db, { ...rv, dismissed: 1 }, p.head_sha);
});

// Resolving a thread (Shed's own; Forgejo's API has no way to). Any comment in the thread can be named.
for (const [m, on] of [
	['POST', true],
	['DELETE', false]
] as const)
	route(m, '/repos/:owner/:repo/pulls/comments/:id/resolve', (c) => {
		const r = repoOf(c);
		const u = me(c);
		const x = c.db.query<CommentRow & { repo_id: number }, [number]>('select cm.*, i.repo_id from comments cm join issues i on i.id = cm.issue_id where cm.id = ?').get(Number(c.params.id));
		if (!x || x.repo_id !== r.row.id || !x.path) error(404, 'Line comment not found');
		if (!atLeast(r.level, 'write') && x.user_id !== u.id && c.db.query<{ user_id: number }, [number]>('select user_id from issues where id = ?').get(x.issue_id)!.user_id !== u.id)
			error(403, 'Only the PR author, the commenter or people with write access can resolve this');
		c.db
			.query('update comments set resolved_by = ?, resolved_at = ? where issue_id = ? and path = ? and side = ? and line = ? and commit_sha = ?')
			.run(on ? u.id : null, on ? now() : null, x.issue_id, x.path, x.side, x.line, x.commit_sha);
	});

// --- review requests ---

function requestReview(c: Ctx, r: RepoCtx, p: PullRow, login: string, remove: boolean) {
	const u = userByLogin(c.db, login) ?? error(422, `No user called ${login}`);
	if (!remove && !atLeast(access(c.db, u.id, r.row), 'read')) error(422, `${login} can't see this repo`);
	if (remove) c.db.query('delete from review_requests where issue_id = ? and user_id = ?').run(p.id, u.id);
	else {
		c.db.query('insert or ignore into review_requests (issue_id, user_id) values (?, ?)').run(p.id, u.id);
		c.db.query('insert or ignore into subscriptions (user_id, issue_id) values (?, ?)').run(u.id, p.id);
		c.db
			.query("insert into notifications (user_id, issue_id, repo_id, unread, updated_at) values (?, ?, ?, 1, ?) on conflict (user_id, issue_id) do update set unread = 1, updated_at = excluded.updated_at")
			.run(u.id, p.id, r.row.id, now());
	}
	event(c.db, p.id, me(c).id, 'review_request', { reviewer: u.id, removed: remove });
}
for (const [m, remove] of [
	['POST', false],
	['DELETE', true]
] as const)
	route(m, '/repos/:owner/:repo/pulls/:index/requested_reviewers', async (c) => {
		const r = repoOf(c);
		const p = pullOf(c, r);
		if (!atLeast(r.level, 'write') && p.user_id !== me(c).id) error(403, 'Only the author or people with write access can ask for reviews');
		for (const login of (await c.body<{ reviewers?: string[] }>()).reviewers ?? []) requestReview(c, r, p, login, remove);
		return remove ? undefined : [];
	});

// Everyone who can be asked to review: the owner, collaborators and org members who can read the repo.
route('GET', '/repos/:owner/:repo/reviewers', (c) => {
	const r = repoOf(c);
	return c.db
		.query<UserRow, [number, number, number]>(
			`select * from users where kind = 'user' and (id = ? or id in (select user_id from collaborators where repo_id = ?) or id in (select user_id from org_members where org_id = ?)) order by login`
		)
		.all(r.row.owner_id, r.row.id, r.row.owner_id)
		.filter((u) => atLeast(access(c.db, u.id, r.row), 'read'))
		.map((u) => userJson(c.db, u.id)!);
});

// --- merging ---

// What stands between this PR and a merge, by branch protection: approvals, rejections and required checks.
export async function blockers(c: Ctx, r: RepoCtx, p: PullRow) {
	const rule = protectionFor(c.db, r.row.id, p.base);
	const out: string[] = [];
	if (!rule) return out;
	// Each person's latest decisive review counts; stale ones don't when the rule says so.
	const latestBy = new Map<number, ReviewRow>();
	for (const rv of c.db.query<ReviewRow, [number]>("select * from reviews where issue_id = ? and dismissed = 0 and state in ('APPROVED', 'REQUEST_CHANGES') order by id").all(p.id)) latestBy.set(rv.user_id, rv);
	const decisive = [...latestBy.values()].filter((rv) => atLeast(access(c.db, rv.user_id, r.row), 'write'));
	const approvals = decisive.filter((rv) => rv.state === 'APPROVED' && (!rule.dismiss_stale || rv.commit_sha === p.head_sha)).length;
	if (approvals < rule.required_approvals) out.push(`needs ${rule.required_approvals} approval${rule.required_approvals === 1 ? '' : 's'} (has ${approvals})`);
	if (rule.block_on_rejected && decisive.some((rv) => rv.state === 'REQUEST_CHANGES')) out.push('changes were requested');
	const required: string[] = JSON.parse(rule.required_checks);
	if (required.length) {
		const states = new Map(latest(c, r.row.id, p.head_sha).map((s) => [s.context, s.state]));
		const missing = required.filter((ctx) => states.get(ctx) !== 'success' && ![...states.keys()].some((k) => k.startsWith(ctx) && states.get(k) === 'success'));
		if (missing.length) out.push(`required checks haven't passed: ${missing.join(', ')}`);
	}
	return out;
}

type MergeStyle = 'merge' | 'rebase' | 'rebase-merge' | 'squash' | 'fast-forward-only';

async function rebaseOnto(dir: string, base: string, head: string, committer: { name: string; email: string }) {
	// git replay (2.44+) rebases without a checkout; older git gets a throwaway worktree.
	const replay = await gitTry(dir, ['replay', '--onto', base, `${base}..${head}`]);
	if (replay !== null) {
		const tip = replay.trim().split('\n').at(-1)?.split(' ')[2];
		if (tip) return tip;
	}
	const wt = await mkdtemp(`${tmpdir()}/shed-rebase-`);
	const env = { GIT_COMMITTER_NAME: committer.name, GIT_COMMITTER_EMAIL: committer.email };
	try {
		await git(dir, ['worktree', 'add', '--quiet', '--detach', wt, head]);
		const p = Bun.spawn(['git', '-C', wt, 'rebase', '--quiet', base], { stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', ...env } });
		if ((await p.exited) !== 0) error(409, "This branch can't be rebased cleanly; rebase it locally");
		return (await new Response(Bun.spawn(['git', '-C', wt, 'rev-parse', 'HEAD'], { stdout: 'pipe' }).stdout).text()).trim();
	} finally {
		await git(dir, ['worktree', 'remove', '--force', wt]).catch(() => rm(wt, { recursive: true, force: true }));
		await git(dir, ['worktree', 'prune']).catch(() => {});
	}
}

export async function doMerge(c: Ctx, r: RepoCtx, p: PullRow, o: { style: MergeStyle; title?: string; message?: string; deleteBranch?: boolean; force?: boolean }) {
	const u = me(c);
	if (p.merged_at) error(405, 'This pull request is already merged');
	if (p.state !== 'open') error(405, 'This pull request is closed');
	if (p.draft) error(405, 'This pull request is a draft; mark it ready for review first');
	if (!atLeast(r.level, 'write')) error(403, 'Merging needs write access');
	const styles: string[] = JSON.parse(c.db.query<{ merge_styles: string }, [number]>('select merge_styles from repos where id = ?').get(r.row.id)!.merge_styles);
	if (!styles.includes(o.style)) error(405, `This repo doesn't allow ${o.style} merges`);
	const blocked = await blockers(c, r, p);
	if (blocked.length && !(o.force && r.level === 'admin')) error(405, `Can't merge yet: ${blocked.join('; ')}`);
	const baseSha = (await refSha(r.dir, `refs/heads/${p.base}`)) ?? error(404, `${p.base} is gone`);
	const head = p.head_sha;
	const who = { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` };
	const env = { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
	const title = o.title?.trim() || (o.style === 'squash' ? `${p.title} (#${p.number})` : `Merge pull request '${p.title}' (#${p.number}) from ${p.head} into ${p.base}`);
	const message = `${title}\n\n${o.message?.trim() ?? ''}`.trim() + '\n';
	const tree = async () => {
		const res = spawn(['--git-dir', r.dir, 'merge-tree', '--write-tree', '--no-messages', baseSha, head]);
		const out = (await new Response(res.stdout).text()).split('\n')[0].trim();
		if ((await res.exited) !== 0) error(409, 'This pull request has conflicts; resolve them first');
		return out;
	};
	let next: string;
	if (o.style === 'fast-forward-only') {
		if ((await browse.mergeBase(r.dir, baseSha, head)) !== baseSha) error(409, `${p.base} has moved on, so this can't fast-forward; update the branch first`);
		next = head;
	} else if (o.style === 'merge') {
		next = (await git(r.dir, ['commit-tree', await tree(), '-p', baseSha, '-p', head, '-F', '-'], message, env)).trim();
	} else if (o.style === 'squash') {
		// The squashed commit keeps the PR author as its author.
		const author = userRow(c.db, p.user_id);
		const authorEnv = { ...env, GIT_AUTHOR_NAME: author.name || author.login, GIT_AUTHOR_EMAIL: author.email ?? `${author.login}@users.noreply` };
		const log = (await git(r.dir, ['log', '--reverse', '--format=* %s', `${p.merge_base ?? baseSha}..${head}`])).trim();
		next = (await git(r.dir, ['commit-tree', await tree(), '-p', baseSha, '-F', '-'], o.message?.trim() ? message : `${title}\n\n${log}\n`, authorEnv)).trim();
	} else {
		const rebased = await rebaseOnto(r.dir, baseSha, head, who);
		next = o.style === 'rebase' ? rebased : (await git(r.dir, ['commit-tree', `${rebased}^{tree}`, '-p', baseSha, '-p', rebased, '-F', '-'], message, env)).trim();
	}
	const before = await refSnapshot(r.dir);
	// Compare-and-swap: a push to the base since we read it fails the merge instead of being lost.
	await git(r.dir, ['update-ref', `refs/heads/${p.base}`, next, baseSha]).catch(() => error(409, `${p.base} changed while merging; try again`));
	c.db.query('update pulls set merged_at = ?, merged_by = ?, merge_commit = ?, auto_merge = null where issue_id = ?').run(now(), u.id, next, p.id);
	c.db.query("update issues set state = 'closed', closed_at = ? where id = ?").run(now(), p.id);
	event(c.db, p.id, u.id, 'merge_pull', { commit_id: next, style: o.style });
	record(c.db, { userId: u.id, repoId: r.row.id, op: 'merge_pull_request', content: JSON.stringify([String(p.number), p.title]) });
	notify(c, r, p, 'merged it', '');
	await afterPush(c.db, c.root, r.row, u.id, before);
	await pullEvent(c.db, c.root, c.origin, r.row, pullById(c, p.id), 'closed', u.id);
	if (o.deleteBranch && !p.head_repo_id && p.head !== r.row.default_branch && !protectionFor(c.db, r.row.id, p.head)) {
		const still = c.db.query(`${SELECT} where i.repo_id = ? and i.state = 'open' and p.base = ?`).get(r.row.id, p.head);
		if (!still) {
			const b2 = await refSnapshot(r.dir);
			await git(r.dir, ['update-ref', '-d', `refs/heads/${p.head}`, head]).catch(() => {});
			await afterPush(c.db, c.root, r.row, u.id, b2);
			event(c.db, p.id, u.id, 'delete_branch', { ref: p.head });
		}
	}
	return next;
}

route('POST', '/repos/:owner/:repo/pulls/:index/merge', async (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const b = await c.body<{ Do?: MergeStyle; MergeTitleField?: string; MergeMessageField?: string; delete_branch_after_merge?: boolean; merge_when_checks_succeed?: boolean; head_commit_id?: string; force_merge?: boolean }>();
	const style = b.Do ?? (c.db.query<{ s: MergeStyle }, [number]>('select default_merge_style as s from repos where id = ?').get(r.row.id)!.s);
	if (b.head_commit_id && b.head_commit_id !== p.head_sha) error(409, 'New commits were pushed; look again before merging');
	if (b.merge_when_checks_succeed) {
		if (!atLeast(r.level, 'write')) error(403, 'Merging needs write access');
		const status = combinedStatus(c, r.row.id, p.head_sha);
		if (status.state !== 'pending' && !(await blockers(c, r, p)).length) {
			await doMerge(c, r, p, { style, title: b.MergeTitleField, message: b.MergeMessageField, deleteBranch: b.delete_branch_after_merge });
			return undefined;
		}
		c.db.query('update pulls set auto_merge = ?, auto_merge_by = ?, auto_merge_message = ? where issue_id = ?').run(style, me(c).id, JSON.stringify({ title: b.MergeTitleField, message: b.MergeMessageField, deleteBranch: !!b.delete_branch_after_merge }), p.id);
		event(c.db, p.id, me(c).id, 'pull_scheduled_merge', { style });
		return undefined;
	}
	await doMerge(c, r, p, { style, title: b.MergeTitleField, message: b.MergeMessageField, deleteBranch: b.delete_branch_after_merge, force: b.force_merge });
});
route('DELETE', '/repos/:owner/:repo/pulls/:index/merge', (c) => {
	const r = repoOf(c, 'write');
	const p = pullOf(c, r);
	if (!p.auto_merge) error(404, 'Nothing is scheduled');
	c.db.query('update pulls set auto_merge = null, auto_merge_by = null where issue_id = ?').run(p.id);
	event(c.db, p.id, me(c).id, 'pull_cancel_scheduled_merge');
});
route('GET', '/repos/:owner/:repo/pulls/:index/merge', (c) => (pullOf(c, repoOf(c)).merged_at ? undefined : error(404, 'Not merged')));

// Bring the head up to date with the base: a merge commit (default) or a rebase, pushed to the head branch.
route('POST', '/repos/:owner/:repo/pulls/:index/update', async (c) => {
	const r = repoOf(c);
	const p = pullOf(c, r);
	const u = me(c);
	// A fork's branch is written in the fork, by its rules and access, and the fork's push listener then moves the PR along.
	const fork = p.head_repo_id && p.head_repo_id !== r.row.id ? c.db.query<RepoRow, [number]>(`${REPO} where r.id = ?`).get(p.head_repo_id) : null;
	if (p.head_repo_id && !fork) error(404, 'The fork this branch was in is gone');
	const head: RepoCtx = fork ? { row: fork, level: c.token ? tokenAccess(c.db, c.token, fork) : access(c.db, u.id, fork), dir: repoDir(c.root, fork.id), full: `${fork.owner}/${fork.name}` } : r;
	if (!atLeast(head.level, 'write') && p.user_id !== u.id) error(403, 'Only the author or people with write access can update this branch');
	if (head.row.archived) error(403, `${head.full} is archived`);
	const rebase = c.url.searchParams.get('style') === 'rebase';
	checkRefWrite(c.db, head.row, head.level, p.head, rebase ? 'force' : 'push');
	const baseSha = (await refSha(r.dir, `refs/heads/${p.base}`))!;
	const who = { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` };
	let next: string;
	if (rebase) next = await rebaseOnto(r.dir, baseSha, p.head_sha, who);
	else {
		const res = spawn(['--git-dir', r.dir, 'merge-tree', '--write-tree', '--no-messages', p.head_sha, baseSha]);
		const tree = (await new Response(res.stdout).text()).split('\n')[0].trim();
		if ((await res.exited) !== 0) error(409, 'Updating would conflict; merge locally');
		const env = { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
		next = (await git(r.dir, ['commit-tree', tree, '-p', p.head_sha, '-p', baseSha, '-m', `Merge branch '${p.base}' into ${p.head}`], undefined, env)).trim();
	}
	// The new commits are made in the base repo; a fork gets them through a temporary ref (a fetch can't ask for a bare SHA).
	const tmp = `refs/shed/tmp/update-${crypto.randomUUID()}`;
	if (fork) {
		await git(r.dir, ['update-ref', tmp, next]);
		await git(head.dir, ['fetch', '--quiet', '--no-tags', r.dir, `${tmp}:${tmp}`]).finally(() => git(r.dir, ['update-ref', '-d', tmp]));
	}
	const before = await refSnapshot(head.dir);
	try {
		await git(head.dir, ['update-ref', `refs/heads/${p.head}`, next, p.head_sha]).catch(() => error(409, 'The branch moved; try again'));
	} finally {
		if (fork) await git(head.dir, ['update-ref', '-d', tmp]).catch(() => {});
	}
	await afterPush(c.db, c.root, head.row, u.id, before);
});

// --- auto-merge ---

async function tryAutoMerge(c: Ctx, r: RepoCtx, issueId: number) {
	const p = pullById(c, issueId);
	if (!p.auto_merge || p.state !== 'open' || p.merged_at) return;
	const state = overall(latest(c, r.row.id, p.head_sha).map((s) => s.state));
	if (state === 'pending' || state === 'failure') return;
	if ((await blockers(c, r, p)).length) return;
	const by = userRow(c.db, p.auto_merge_by!);
	const o = JSON.parse(p.auto_merge_message ?? '{}');
	const as: Ctx = { ...c, user: by, token: null };
	await doMerge(as, { ...r, level: access(c.db, by.id, r.row) }, p, { style: p.auto_merge as MergeStyle, ...o }).catch((e) => console.error('auto-merge', r.full, p.number, e));
}
onCiStatus((db, repoId, sha) => {
	const c: Ctx = { db, root: '', origin: '', user: null, token: null, method: 'POST', url: new URL('http://shed/'), params: {}, request: new Request('http://shed/'), body: async () => ({}) as never };
	void import('../shed.js').then(({ root, origin }) => {
		c.root = root;
		c.origin = origin();
		for (const fn of statusHooks) fn(c, repoId, sha);
	});
});
const statusHooks: ((c: Ctx, repoId: number, sha: string) => void)[] = [];
statusHooks.push((c, repoId, sha) => {
	const row = c.db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(repoId)!;
	const r: RepoCtx = { row, level: 'admin', dir: repoDir(c.root, repoId), full: `${row.owner}/${row.name}` };
	for (const p of c.db.query<{ id: number }, [number, string]>("select i.id from issues i join pulls p on p.issue_id = i.id where i.repo_id = ? and p.head_sha = ? and p.auto_merge is not null and i.state = 'open'").all(repoId, sha))
		void tryAutoMerge(c, r, p.id);
});
onStatus((c, repoId, sha) => statusHooks.forEach((fn) => fn(c, repoId, sha)));

// --- pushes: new revisions on PR heads, merges noticed on bases ---

onPush(async ({ db, root, repo, userId, updates }) => {
	const c: Ctx = { db, root, origin: '', user: userRow(db, userId), token: null, method: 'POST', url: new URL('http://shed/'), params: {}, request: new Request('http://shed/'), body: async () => ({}) as never };
	for (const u of updates) {
		if (!u.ref.startsWith('refs/heads/')) continue;
		const branch = u.ref.slice('refs/heads/'.length);
		// PRs whose head is this branch, in this repo or (for forks) in the repo the PR targets.
		const heads = db.query<PullRow, [string, number]>(`${SELECT} where i.state = 'open' and p.head = ? and coalesce(p.head_repo_id, i.repo_id) = ?`).all(branch, repo.id);
		for (const p of heads) {
			const baseRow = db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(p.repo_id)!;
			const r: RepoCtx = { row: baseRow, level: 'admin', dir: repoDir(root, baseRow.id), full: `${baseRow.owner}/${baseRow.name}` };
			if (!u.after) {
				event(db, p.id, userId, 'delete_branch', { ref: branch });
				continue;
			}
			if (u.after === p.head_sha) continue;
			const forced = !!(await gitTry(repoDir(root, repo.id), ['merge-base', '--is-ancestor', p.head_sha, u.after]).then((x) => x === null));
			db.query('update pulls set head_sha = ? where issue_id = ?').run(u.after, p.id);
			await syncHeadRef(c, r, pullById(c, p.id));
			const baseSha = await refSha(r.dir, `refs/heads/${p.base}`);
			if (baseSha) db.query('update pulls set merge_base = ? where issue_id = ?').run(await browse.mergeBase(r.dir, baseSha, u.after), p.id);
			db.query('insert into revisions (issue_id, head_sha, before_sha, base_sha, user_id, forced) values (?, ?, ?, ?, ?, ?)').run(p.id, u.after, p.head_sha, baseSha, userId, +forced);
			const commits = forced ? [] : (await git(r.dir, ['rev-list', `${p.head_sha}..${u.after}`])).split('\n').filter(Boolean);
			event(db, p.id, userId, 'pull_push', { is_force_push: forced, commit_ids: commits, before: p.head_sha, after: u.after });
			await pullEvent(db, root, (await import('../shed.js').catch(() => ({ origin: () => '' }))).origin(), r.row, pullById(c, p.id), 'synchronize', userId);
			// Approvals of an older head lapse when the base branch's rule says so.
			if (protectionFor(db, r.row.id, p.base)?.dismiss_stale) db.query("update reviews set dismissed = 1 where issue_id = ? and state = 'APPROVED' and commit_sha != ?").run(p.id, u.after);
		}
		// Bases that moved: refresh merge bases, and close PRs whose head is now in the base (merged by a plain push).
		if (!u.after) continue;
		for (const p of db.query<PullRow, [number, string]>(`${SELECT} where i.repo_id = ? and i.state = 'open' and p.base = ?`).all(repo.id, branch)) {
			const dir = repoDir(root, repo.id);
			if (await gitTry(dir, ['merge-base', '--is-ancestor', p.head_sha, u.after]).then((x) => x !== null)) {
				db.query('update pulls set merged_at = ?, merged_by = ?, merge_commit = ? where issue_id = ?').run(now(), userId, u.after, p.id);
				db.query("update issues set state = 'closed', closed_at = ? where id = ?").run(now(), p.id);
				event(db, p.id, userId, 'merge_pull', { commit_id: u.after, manual: true });
			} else db.query('update pulls set merge_base = ? where issue_id = ?').run(await browse.mergeBase(dir, u.after, p.head_sha), p.id);
		}
	}
});

export { addComment, issueOf };
