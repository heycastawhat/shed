import { error } from '@sveltejs/kit';
import { userJson } from './common.js';
import { me, page, Paged, route, type Ctx } from './router.js';
import { refSha, repoOf } from './common.js';

type StatusRow = { id: number; sha: string; context: string; state: string; description: string; target_url: string; creator_id: number | null; created_at: string };

const json = (c: Ctx, s: StatusRow) => ({
	id: s.id,
	context: s.context,
	// Forgejo names the field `status` in responses.
	status: s.state,
	state: s.state,
	description: s.description,
	target_url: s.target_url,
	creator: userJson(c.db, s.creator_id),
	created_at: s.created_at,
	updated_at: s.created_at
});

// The newest status per context, and an overall state: any failure/error fails it, then anything pending, else success.
export function latest(c: Ctx, repoId: number, sha: string) {
	return c.db
		.query<StatusRow, [number, string]>('select * from statuses where id in (select max(id) from statuses where repo_id = ? and sha = ? group by context) order by context')
		.all(repoId, sha);
}
export function overall(states: string[]) {
	if (!states.length) return '';
	if (states.some((s) => s === 'failure' || s === 'error')) return 'failure';
	if (states.some((s) => s === 'pending')) return 'pending';
	if (states.some((s) => s === 'warning')) return 'warning';
	return 'success';
}
export function combinedStatus(c: Ctx, repoId: number, sha: string) {
	const list = latest(c, repoId, sha);
	return { state: overall(list.map((s) => s.state)), sha, total_count: list.length, statuses: list.map((s) => json(c, s)) };
}

route('GET', '/repos/:owner/:repo/statuses/:sha', async (c) => {
	const r = repoOf(c);
	const sha = (await refSha(r.dir, c.params.sha)) ?? error(404, 'Commit not found');
	const all = c.db.query<StatusRow, [number, string]>('select * from statuses where repo_id = ? and sha = ? order by id desc').all(r.row.id, sha);
	const p = page(c);
	return new Paged(all.slice(p.offset, p.offset + p.limit).map((s) => json(c, s)), all.length);
});
const setters: ((c: Ctx, repoId: number, sha: string) => void)[] = [];
// Auto-merge listens here: a new status may be the one a scheduled merge was waiting for.
export const onStatus = (fn: (c: Ctx, repoId: number, sha: string) => void) => setters.push(fn);
export function setStatus(c: Ctx, repoId: number, sha: string, s: { context?: string; state: string; description?: string; target_url?: string }, creator: number | null) {
	if (!['pending', 'success', 'error', 'failure', 'warning'].includes(s.state)) error(422, 'state must be pending, success, error, failure or warning');
	c.db.query('insert into statuses (repo_id, sha, context, state, description, target_url, creator_id) values (?, ?, ?, ?, ?, ?, ?)').run(repoId, sha, s.context || 'default', s.state, s.description ?? '', s.target_url ?? '', creator);
	for (const fn of setters) fn(c, repoId, sha);
}
route('POST', '/repos/:owner/:repo/statuses/:sha', async (c) => {
	const r = repoOf(c, 'write');
	const sha = (await refSha(r.dir, c.params.sha)) ?? error(404, 'Commit not found');
	const b = await c.body<{ context?: string; state: string; description?: string; target_url?: string }>();
	setStatus(c, r.row.id, sha, b, me(c).id);
	return json(c, c.db.query<StatusRow, []>('select * from statuses order by id desc limit 1').get()!);
});
