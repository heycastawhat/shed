import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { onActivity } from '../activity.js';
import { onPullEvent } from '../actions/runs.js';
import { git } from '../git.js';
import { onPush } from '../push.js';
import { repoDir, type RepoRow } from '../repos.js';
import { repoOf, userJson } from './common.js';
import { commentJson, issueJson, type CommentRow, type IssueRow } from './shapes.js';
import { route, type Ctx } from './router.js';

// Webhooks, Forgejo-compatible: the same endpoints, event names, headers and (roughly) payloads, so tools written for Forgejo
// or GitHub receive them unchanged. Deliveries go out in the background and never hold up the request that caused them.

export const EVENTS = ['push', 'pull_request', 'issues', 'issue_comment', 'release'] as const;
export type HookRow = { id: number; repo_id: number; url: string; secret: string; events: string; active: number; created_at: string };
export type DeliveryRow = { id: number; hook_id: number; event: string; status: number | null; response: string; payload: string; headers: string; created_at: string };
const deliveryJson = (d: DeliveryRow) => ({ ...d, headers: JSON.parse(d.headers) as Record<string, string> });

const KEEP = 50;
const TIMEOUT = 10_000;

const hookJson = (h: HookRow) => ({
	id: h.id,
	type: 'forgejo',
	config: { url: h.url, content_type: 'json' },
	events: JSON.parse(h.events) as string[],
	active: !!h.active,
	branch_filter: '*',
	created_at: h.created_at,
	updated_at: h.created_at
});

// Admins set these, and homelab services live on private addresses, so those are allowed; only the scheme is restricted.
function checkUrl(v: unknown) {
	const url = URL.parse(String(v ?? ''));
	if (!url || !['http:', 'https:'].includes(url.protocol)) error(422, 'The URL must start with http:// or https://');
	return url.href;
}
function checkEvents(v: unknown) {
	const list = Array.isArray(v) ? v.map(String) : ['push'];
	const bad = list.find((e) => !(EVENTS as readonly string[]).includes(e));
	if (bad) error(422, `Unknown event ${bad}; Shed sends ${EVENTS.join(', ')}`);
	if (!list.length) error(422, 'Pick at least one event');
	return JSON.stringify([...new Set(list)]);
}

const hookOf = (c: Ctx) =>
	c.db.query<HookRow, [number, number]>('select * from hooks where id = ? and repo_id = ?').get(Number(c.params.id), repoOf(c, 'admin').row.id) ?? error(404, 'Webhook not found');
const getHook = (db: Database, id: number) => db.query<HookRow, [number]>('select * from hooks where id = ?').get(id)!;

route('GET', '/repos/:owner/:repo/hooks', (c) => c.db.query<HookRow, [number]>('select * from hooks where repo_id = ? order by id').all(repoOf(c, 'admin').row.id).map(hookJson));
route('GET', '/repos/:owner/:repo/hooks/:id', (c) => hookJson(hookOf(c)));
route('POST', '/repos/:owner/:repo/hooks', async (c) => {
	const r = repoOf(c, 'admin');
	const b = await c.body<{ type?: string; config?: { url?: string; secret?: string; content_type?: string }; events?: string[]; active?: boolean }>();
	if (b.config?.content_type && b.config.content_type !== 'json') error(422, 'Shed only sends JSON');
	const id = Number(
		c.db
			.query('insert into hooks (repo_id, url, secret, events, active) values (?, ?, ?, ?, ?)')
			.run(r.row.id, checkUrl(b.config?.url), b.config?.secret ?? '', checkEvents(b.events), +(b.active ?? true)).lastInsertRowid
	);
	return hookJson(getHook(c.db, id));
});
route('PATCH', '/repos/:owner/:repo/hooks/:id', async (c) => {
	const h = hookOf(c);
	const b = await c.body<{ config?: { url?: string; secret?: string }; events?: string[]; active?: boolean }>();
	c.db
		.query('update hooks set url = ?, secret = ?, events = ?, active = ? where id = ?')
		.run(
			b.config?.url !== undefined ? checkUrl(b.config.url) : h.url,
			b.config?.secret ?? h.secret,
			b.events ? checkEvents(b.events) : h.events,
			b.active === undefined ? h.active : +b.active,
			h.id
		);
	return hookJson(getHook(c.db, h.id));
});
route('DELETE', '/repos/:owner/:repo/hooks/:id', (c) => {
	c.db.query('delete from hooks where id = ?').run(hookOf(c).id);
});
// Shed's own: recent deliveries, newest first.
route('GET', '/repos/:owner/:repo/hooks/:id/deliveries', (c) =>
	c.db.query<DeliveryRow, [number]>('select * from hook_deliveries where hook_id = ? order by id desc').all(hookOf(c).id).map(deliveryJson)
);
// Shed's own: send a recorded delivery's body again, signed with the hook's current secret and URL, as a new delivery.
route('POST', '/repos/:owner/:repo/hooks/:id/deliveries/:delivery/redeliver', async (c) => {
	const h = hookOf(c);
	const d =
		c.db.query<DeliveryRow, [number, number]>('select * from hook_deliveries where id = ? and hook_id = ?').get(Number(c.params.delivery), h.id) ?? error(404, 'Delivery not found');
	if (!d.payload) error(422, 'This delivery was recorded before Shed kept bodies, so it can\'t be sent again');
	const id = await send(c.db, h, d.event, d.payload);
	return deliveryJson(c.db.query<DeliveryRow, [number]>('select * from hook_deliveries where id = ?').get(id ?? 0) ?? error(404, 'Webhook not found'));
});
// A test sends a push event for the default branch's latest commit, as Forgejo does, and waits for the answer so the page can show it.
route('POST', '/repos/:owner/:repo/hooks/:id/tests', async (c) => {
	const h = hookOf(c);
	const r = repoOf(c, 'admin');
	const sha = (await git(r.dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${r.row.default_branch}`]).catch(() => '')).trim();
	await deliver(
		c.db,
		h,
		'push',
		await pushPayload(c.db, c.root, c.origin, r.row, c.user!.id, { ref: `refs/heads/${r.row.default_branch}`, before: sha || null, after: sha || '0'.repeat(40) })
	);
});

// --- delivery ---

const hmac = (secret: string, body: string) => new Bun.CryptoHasher('sha256', secret).update(body).digest('hex');

// Only the start of a reply is kept; a hook that answers with megabytes shouldn't fill the database.
async function head(res: Response, max = 1000) {
	const reader = res.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < max) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.length;
	}
	reader.cancel().catch(() => {});
	return new TextDecoder().decode(Uint8Array.from(chunks.flatMap((c) => [...c])).slice(0, max));
}

function headersFor(secret: string, event: string, body: string) {
	const id = crypto.randomUUID();
	const sig = hmac(secret, body);
	return {
		'content-type': 'application/json',
		'user-agent': 'Shed-Hookshot',
		'x-forgejo-event': event,
		'x-gitea-event': event,
		'x-github-event': event,
		'x-forgejo-delivery': id,
		'x-gitea-delivery': id,
		'x-github-delivery': id,
		'x-forgejo-signature': sig,
		'x-gitea-signature': sig,
		'x-hub-signature-256': `sha256=${sig}`
	};
}

export const deliver = (db: Database, hook: HookRow, event: string, payload: unknown) => send(db, hook, event, JSON.stringify(payload));

// The body and headers are kept so a delivery can be sent again; the signatures are only good for that body, so they're safe to store.
async function send(db: Database, hook: HookRow, event: string, body: string) {
	const headers = headersFor(hook.secret, event, body);
	let status: number | null = null;
	let response = '';
	try {
		const res = await fetch(hook.url, { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers });
		status = res.status;
		response = status >= 300 && status < 400 ? `Redirect to ${res.headers.get('location') ?? '?'} (not followed)` : await head(res);
	} catch (e) {
		response = e instanceof DOMException && e.name === 'TimeoutError' ? `No answer in ${TIMEOUT / 1000}s` : e instanceof Error ? e.message : String(e);
	}
	// The hook may have been deleted while this was in flight.
	if (!db.query('select 1 from hooks where id = ?').get(hook.id)) return;
	const id = Number(
		db
			.query('insert into hook_deliveries (hook_id, event, status, response, payload, headers) values (?, ?, ?, ?, ?, ?)')
			.run(hook.id, event, status, response, body, JSON.stringify(headers)).lastInsertRowid
	);
	db.query('delete from hook_deliveries where hook_id = ? and id not in (select id from hook_deliveries where hook_id = ? order by id desc limit ?)').run(hook.id, hook.id, KEEP);
	return id;
}

// Hooks for the event, each delivered in the background. Returns the promises for tests.
export function fire(db: Database, repoId: number, event: string, payload: unknown) {
	const hooks = db
		.query<HookRow, [number]>('select * from hooks where repo_id = ? and active = 1')
		.all(repoId)
		.filter((h) => JSON.parse(h.events).includes(event));
	return hooks.map((h) => deliver(db, h, event, payload).catch((e) => console.error('webhook', h.id, e)));
}
const wanted = (db: Database, repoId: number, event: string) =>
	db
		.query<HookRow, [number]>('select * from hooks where repo_id = ? and active = 1')
		.all(repoId)
		.some((h) => JSON.parse(h.events).includes(event));

// --- payloads ---

// shed.js opens the database on import, which tests can't do, so it's loaded lazily (long before any event fires).
let currentOrigin = () => '';
import('../shed.js').then((m) => (currentOrigin = m.origin)).catch(() => {});
const repoRow = (db: Database, id: number) => db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(id)!;
const sender = (db: Database, id: number) => {
	const u = userJson(db, id)!;
	return { ...u, username: u.login };
};
function repository(db: Database, repo: RepoRow, origin: string) {
	const full = `${repo.owner}/${repo.name}`;
	const owner = db.query<{ owner_id: number }, [number]>('select owner_id from repos where id = ?').get(repo.id)!.owner_id;
	return {
		id: repo.id,
		owner: sender(db, owner),
		name: repo.name,
		full_name: full,
		description: repo.description,
		private: !!repo.private,
		archived: !!repo.archived,
		default_branch: repo.default_branch,
		html_url: `${origin}/${full}`,
		clone_url: `${origin}/${full}.git`,
		created_at: repo.created_at,
		updated_at: repo.updated_at
	};
}
const ref = (repo: RepoRow) => ({ full: `${repo.owner}/${repo.name}`, name: repo.name, owner: repo.owner, id: repo.id });

async function pushPayload(db: Database, root: string, origin: string, repo: RepoRow, userId: number, u: { ref: string; before: string | null; after: string }) {
	const dir = repoDir(root, repo.id);
	const full = `${repo.owner}/${repo.name}`;
	const zero = '0'.repeat(u.after.length);
	const range = u.before && !/^0+$/.test(u.before) && u.before !== u.after ? [`${u.before}..${u.after}`] : ['-1', u.after];
	const log = /^0+$/.test(u.after) ? '' : await git(dir, ['log', '--max-count=20', '--format=%H%x00%an%x00%ae%x00%aI%x00%B%x1e', ...range]).catch(() => '');
	const commits = log
		.split('\x1e')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => {
			const [id, name, email, timestamp, message] = s.split('\0');
			return { id, message, url: `${origin}/${full}/commit/${id}`, author: { name, email, username: '' }, committer: { name, email, username: '' }, timestamp };
		})
		.reverse();
	const who = sender(db, userId);
	return {
		ref: u.ref,
		before: u.before ?? zero,
		after: u.after,
		compare_url: u.before ? `${origin}/${full}/compare/${u.before}...${u.after}` : '',
		commits,
		total_commits: commits.length,
		head_commit: commits.at(-1) ?? null,
		repository: repository(db, repo, origin),
		pusher: who,
		sender: who
	};
}

onPush(async ({ db, root, repo, userId, updates }) => {
	if (!wanted(db, repo.id, 'push')) return;
	const origin = currentOrigin();
	for (const u of updates) if (u.after) fire(db, repo.id, 'push', await pushPayload(db, root, origin, repo, userId, { ...u, after: u.after }));
});

onPullEvent((db, origin, repo, p, action, userId) => {
	if (!wanted(db, repo.id, 'pull_request')) return;
	const issue = db.query<IssueRow, [number]>('select * from issues where id = ?').get(p.id)!;
	const pull = db.query<{ merge_commit: string | null; merged_at: string | null }, [number]>('select merge_commit, merged_at from pulls where issue_id = ?').get(p.id);
	const full = `${repo.owner}/${repo.name}`;
	fire(db, repo.id, 'pull_request', {
		action,
		number: p.number,
		pull_request: {
			...issueJson(db, origin, ref(repo), issue),
			html_url: `${origin}/${full}/pulls/${p.number}`,
			head: { ref: p.head, sha: p.head_sha, label: p.head },
			base: { ref: p.base, label: p.base },
			merge_base: p.merge_base,
			merged: !!pull?.merged_at,
			merged_at: pull?.merged_at ?? null,
			merge_commit_sha: pull?.merge_commit ?? null
		},
		repository: repository(db, repo, origin),
		sender: sender(db, userId)
	});
});

const ISSUE_OPS: Record<string, string> = { create_issue: 'opened', close_issue: 'closed', reopen_issue: 'reopened' };
onActivity((db, e) => {
	if (!e.repoId) return;
	const event = e.op in ISSUE_OPS ? 'issues' : e.op === 'comment_issue' || e.op === 'comment_pull' ? 'issue_comment' : e.op === 'publish_release' ? 'release' : null;
	if (!event || !wanted(db, e.repoId, event)) return;
	const repoId = e.repoId;
	const repo = repoRow(db, repoId);
	const origin = currentOrigin();
	// Built now, while the rows are as the event left them (record() may run inside a transaction).
	const payload = (() => {
		const base = { repository: repository(db, repo, origin), sender: sender(db, e.userId) };
		if (event === 'release') {
			const x = db
				.query<
					{ id: number; tag: string; target: string; name: string; body: string; prerelease: number; user_id: number; created_at: string; published_at: string | null },
					[number, string]
				>('select * from releases where repo_id = ? and tag = ?')
				.get(repoId, e.ref!.replace(/^refs\/tags\//, ''));
			if (!x) return null;
			const html = `${origin}/${repo.owner}/${repo.name}/releases/tag/${encodeURIComponent(x.tag)}`;
			return {
				action: 'published',
				release: {
					id: x.id,
					tag_name: x.tag,
					target_commitish: x.target,
					name: x.name,
					body: x.body,
					draft: false,
					prerelease: !!x.prerelease,
					author: userJson(db, x.user_id),
					created_at: x.created_at,
					published_at: x.published_at,
					html_url: html
				},
				...base
			};
		}
		const number = Number(JSON.parse(String(e.content))[0]);
		const issue = db.query<IssueRow, [number, number]>('select * from issues where repo_id = ? and number = ?').get(repoId, number);
		if (!issue) return null;
		const i = issueJson(db, origin, ref(repo), issue);
		if (event === 'issues') return { action: ISSUE_OPS[e.op], number, issue: i, ...base };
		const comment = db
			.query<CommentRow, [number, number]>('select * from comments where issue_id = ? and user_id = ? and review_id is null order by id desc limit 1')
			.get(issue.id, e.userId);
		if (!comment) return null;
		return { action: 'created', issue: i, comment: commentJson(db, origin, `${repo.owner}/${repo.name}`, number, comment), is_pull: !!issue.is_pull, ...base };
	})();
	if (payload) fire(db, repoId, event, payload);
});
