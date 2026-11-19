import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { openDb } from '../db.js';
import { git } from '../git.js';
import { createRepo, getRepo, repoDir } from '../repos.js';
import { commitFiles } from '../write.js';
import { testEnv } from '../test-env.js';

// Compare, reactions, reviewers, notifications, search and release assets, through the API as pages call it.

let root: string, db: Database, ada: number, other: number, dir: string;
let dispatch: typeof import('./index.js').dispatch;
// The API's Actions routes reach Kit's env module; tests have no Kit, so stand it in.
const scratch = `${tmpdir()}/shed-api-env-${crypto.randomUUID()}`;
mock.module('$app/env/private', testEnv);
const author = { name: 'Ada', email: 'ada@x' };

async function call(as: number | null, method: string, path: string, body?: unknown) {
	const init: RequestInit = { method };
	if (body instanceof FormData) init.body = body;
	else if (body !== undefined) (init.body = JSON.stringify(body)), (init.headers = { 'content-type': 'application/json' });
	const res = await dispatch(db, root, 'http://shed', new Request(`http://shed/api/v1${path}`, init), { user: as ? getUser(db, as) : null, token: null });
	const text = await res.text();
	let json: any = null;
	try {
		json = JSON.parse(text);
	} catch {}
	return { status: res.status, json, text };
}

beforeAll(async () => {
	({ dispatch } = await import('./index.js'));
	root = await mkdtemp(`${tmpdir()}/shed-api-`);
	db = openDb(':memory:');
	ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	other = signIn(db, { sub: '2', preferred_username: 'other' });
	const id = await createRepo(db, root, ada, { name: 'sample' });
	dir = repoDir(root, id);
	const base = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\n' }], message: 'first', author });
	await commitFiles(dir, { branch: 'feature/x', parent: base, changes: [{ path: 'a.txt', content: 'one\ntwo\n' }], message: 'second', author, newBranch: true });
	await commitFiles(dir, { branch: 'clash', parent: base, changes: [{ path: 'a.txt', content: 'other\n' }], message: 'clash', author, newBranch: true });
	await commitFiles(dir, { branch: 'main', parent: base, changes: [{ path: 'a.txt', content: 'main\n' }, { path: 'b.txt', content: 'needle here\n' }], message: 'main moves', author });
});
afterAll(() => Promise.all([rm(root, { recursive: true }), rm(scratch, { recursive: true, force: true })]));

test('compare: three dots, two dots, text diff and mergeability', async () => {
	const three = await call(ada, 'GET', '/repos/ada/sample/compare/main...feature%2Fx');
	expect(three.status).toBe(200);
	expect(three.json.total_commits).toBe(1);
	expect(three.json.mergeable).toBe(false);
	const diff = await call(ada, 'GET', '/repos/ada/sample/compare/main...feature%2Fx.diff');
	expect(diff.text).toContain('+two');
	expect(diff.text).not.toContain('needle');
	// Two dots diff the tips directly, so main's own change shows (reversed).
	const two = await call(ada, 'GET', '/repos/ada/sample/compare/main..feature%2Fx.diff');
	expect(two.text).toContain('-needle here');
	expect((await call(ada, 'GET', '/repos/ada/sample/compare/main...nope')).status).toBe(404);
	expect((await call(ada, 'GET', '/repos/ada/sample/compare/main...ada:feature%2Fx')).json.total_commits).toBe(1);
});

test('compare: a head in a fork', async () => {
	const { forkRepo } = await import('../fork.js');
	const src = db.query<any, []>("select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.name = 'sample'").get()!;
	const fdir = repoDir(root, (await forkRepo(db, root, src, other)).id);
	const tip = (await git(fdir, ['rev-parse', 'refs/heads/main'])).trim();
	await commitFiles(fdir, { branch: 'fix', parent: tip, changes: [{ path: 'c.txt', content: 'from fork\n' }], message: 'fork fix', author, newBranch: true });
	// The fork is private like its source, so ada only sees it once added; owners of the source can't read other people's forks by default.
	db.query("insert into collaborators (repo_id, user_id, permission) select id, ?, 'read' from repos where fork_of is not null").run(ada);
	const c = await call(ada, 'GET', '/repos/ada/sample/compare/main...other:fix');
	expect(c.status).toBe(200);
	expect(c.json.commits.map((x: { commit: { message: string } }) => x.commit.message.trim())).toEqual(['fork fix']);
	expect(c.json.mergeable).toBe(true);
	// No temporary refs are left behind.
	expect(await git(dir, ['for-each-ref', 'refs/shed/'])).toBe('');
});

test('reactions: adding twice keeps one, removing works', async () => {
	const issue = (await call(ada, 'POST', '/repos/ada/sample/issues', { title: 'Hi' })).json;
	const comment = (await call(ada, 'POST', `/repos/ada/sample/issues/${issue.number}/comments`, { body: 'hello' })).json;
	const path = `/repos/ada/sample/issues/comments/${comment.id}/reactions`;
	await call(ada, 'POST', path, { content: 'heart' });
	await call(ada, 'POST', path, { content: 'heart' });
	expect((await call(ada, 'GET', path)).json).toHaveLength(1);
	await call(ada, 'DELETE', path, { content: 'heart' });
	expect((await call(ada, 'GET', path)).json).toBeNull();
	await call(ada, 'POST', `/repos/ada/sample/issues/${issue.number}/reactions`, { content: 'rocket' });
	await call(ada, 'POST', `/repos/ada/sample/issues/${issue.number}/reactions`, { content: 'rocket' });
	expect((await call(ada, 'GET', `/repos/ada/sample/issues/${issue.number}/reactions`)).json).toHaveLength(1);
	expect((await call(ada, 'POST', path, { content: 'nope' })).status).toBe(422);
});

test('pin and lock show on the issue', async () => {
	const issue = (await call(ada, 'POST', '/repos/ada/sample/issues', { title: 'Pin me' })).json;
	await call(ada, 'POST', `/repos/ada/sample/issues/${issue.number}/pin`);
	await call(ada, 'PUT', `/repos/ada/sample/issues/${issue.number}/lock`);
	const got = (await call(ada, 'GET', `/repos/ada/sample/issues/${issue.number}`)).json;
	expect(got.pin_order).toBe(1);
	expect(got.is_locked).toBe(true);
});

test('reviewers: people who can read, not strangers', async () => {
	const names = (await call(ada, 'GET', '/repos/ada/sample/reviewers')).json.map((u: { login: string }) => u.login);
	expect(names).toEqual(['ada']);
	db.query("insert into collaborators (repo_id, user_id, permission) select id, ?, 'read' from repos where name = 'sample' and fork_of is null").run(other);
	expect((await call(ada, 'GET', '/repos/ada/sample/reviewers')).json.map((u: { login: string }) => u.login)).toEqual(['ada', 'other']);
});

test('notifications: one thread can be read back', async () => {
	const issue = (await call(ada, 'POST', '/repos/ada/sample/issues', { title: 'Ping', body: '@other look' })).json;
	const list = (await call(other, 'GET', '/notifications')).json;
	const n = list.find((x: { subject: { title: string } }) => x.subject.title === 'Ping');
	expect(n.unread).toBe(true);
	expect((await call(other, 'GET', `/notifications/threads/${n.id}`)).json.subject.html_url).toBe(`http://shed/ada/sample/issues/${issue.number}`);
	expect((await call(ada, 'GET', `/notifications/threads/${n.id}`)).status).toBe(404);
});

test('search: users by kind, and code on default branches', async () => {
	expect((await call(ada, 'GET', '/users/search?q=oth')).json.data.map((u: { login: string }) => u.login)).toEqual(['other']);
	expect((await call(ada, 'GET', '/users/search?kind=org')).json.data).toEqual([]);
	const hits = (await call(ada, 'GET', '/repos/code/search?q=NEEDLE')).json.data.filter((h: { repo: string }) => h.repo === 'ada/sample');
	expect(hits).toEqual([{ repo: 'ada/sample', ref: 'main', path: 'b.txt', line: 1, text: 'needle here' }]);
	// A branch that isn't the default isn't searched, and strangers see nothing private.
	expect((await call(ada, 'GET', '/repos/code/search?q=two')).json.data).toEqual([]);
	const stranger = signIn(db, { sub: '3', preferred_username: 'stranger' });
	expect((await call(stranger, 'GET', '/repos/code/search?q=needle')).json.data).toEqual([]);
});

test('release assets upload and delete', async () => {
	const rel = (await call(ada, 'POST', '/repos/ada/sample/releases', { tag_name: 'v1', name: 'One' })).json;
	const form = new FormData();
	form.set('attachment', new File(['bytes'], 'app.bin'));
	const asset = (await call(ada, 'POST', `/repos/ada/sample/releases/${rel.id}/assets`, form)).json;
	expect(asset).toMatchObject({ name: 'app.bin', size: 5, browser_download_url: 'http://shed/ada/sample/releases/download/v1/app.bin' });
	expect((await call(ada, 'DELETE', `/repos/ada/sample/releases/${rel.id}/assets/${asset.id}`)).status).toBe(204);
	expect((await call(ada, 'GET', `/repos/ada/sample/releases/${rel.id}`)).json.assets).toEqual([]);
});

test('current-user mention filters include comment mentions and match explicit-login filters', async () => {
	await createRepo(db, root, ada, { name: 'mention-check', private: false });
	const base = '/repos/ada/mention-check/issues';
	expect((await call(ada, 'GET', `${base}?mentioned=true`)).json).toEqual([]);
	const body = (await call(other, 'POST', base, { title: 'Body mention', body: '@ada look' })).json;
	const comment = (await call(other, 'POST', base, { title: 'Comment mention' })).json;
	await call(other, 'POST', base, { title: 'Unrelated', body: '@other look' });
	expect((await call(other, 'POST', `${base}/${comment.number}/comments`, { body: 'Please check @ada' })).status).toBe(201);
	expect((await call(other, 'POST', `${base}/${comment.number}/comments`, { body: '@ada again' })).status).toBe(201);
	const explicit = (await call(ada, 'GET', `${base}?mentioned_by=ada`)).json;
	const implicit = (await call(ada, 'GET', `${base}?mentioned=true`)).json;
	expect(implicit.map((i: { number: number }) => i.number).sort()).toEqual([body.number, comment.number].sort());
	expect(implicit).toEqual(explicit);
	expect((await call(ada, 'GET', `${base}?mentioned=true&limit=1&page=2`)).json).toHaveLength(1);
});

test('issue creation validates milestones within its repo and drops triage fields from readers', async () => {
	await createRepo(db, root, ada, { name: 'milestone-check', private: false });
	await createRepo(db, root, ada, { name: 'milestone-other' });
	const base = '/repos/ada/milestone-check';
	const own = (await call(ada, 'POST', `${base}/milestones`, { title: 'Own release' })).json;
	const foreign = (await call(ada, 'POST', '/repos/ada/milestone-other/milestones', { title: 'Foreign release' })).json;
	for (const milestone of [foreign.id, 999999]) {
		expect(await call(ada, 'POST', `${base}/issues`, { title: 'Invalid milestone', milestone })).toMatchObject({ status: 422, json: { message: 'No such milestone' } });
	}
	expect((await call(ada, 'GET', `${base}/issues`)).json).toEqual([]);
	const valid = await call(ada, 'POST', `${base}/issues`, { title: 'Valid milestone', milestone: own.id });
	expect(valid.status).toBe(201);
	expect(valid.json).toMatchObject({ number: 1, milestone: { id: own.id, title: 'Own release' } });
	expect((await call(ada, 'POST', `${base}/issues`, { title: 'No milestone' })).json.milestone).toBeNull();
	expect((await call(ada, 'POST', `${base}/issues`, { title: 'Zero milestone', milestone: 0 })).json.milestone).toBeNull();
	const reader = await call(other, 'POST', `${base}/issues`, { title: 'Reader issue', milestone: foreign.id });
	expect(reader.status).toBe(201);
	expect(reader.json.milestone).toBeNull();
});

test('archived repos reject every issue mutation and label or milestone write, but remain readable', async () => {
	const id = await createRepo(db, root, ada, { name: 'archive-check', private: false });
	const base = '/repos/ada/archive-check';
	const issue = (await call(other, 'POST', `${base}/issues`, { title: 'Author issue' })).json;
	const path = `${base}/issues/${issue.number}`;
	expect((await call(other, 'PATCH', path, { title: 'Author edited', body: 'Edited body', state: 'closed' })).status).toBe(200);
	expect((await call(other, 'PATCH', path, { state: 'open' })).status).toBe(200);
	const comment = (await call(other, 'POST', `${path}/comments`, { body: 'Original comment' })).json;
	const commentPath = `${base}/issues/comments/${comment.id}`;
	const label = (await call(ada, 'POST', `${base}/labels`, { name: 'bug', color: 'ff0000' })).json;
	const milestone = (await call(ada, 'POST', `${base}/milestones`, { title: 'Release' })).json;
	expect((await call(ada, 'POST', `${path}/labels`, { labels: [label.id] })).status).toBe(201);
	expect((await call(other, 'POST', `${path}/reactions`, { content: 'eyes' })).status).toBe(201);
	expect((await call(other, 'POST', `${commentPath}/reactions`, { content: 'eyes' })).status).toBe(201);
	db.query('update repos set archived = 1 where id = ?').run(id);
	const writes: [string, string, unknown?][] = [
		['POST', `${base}/issues`, { title: 'New issue' }],
		['PATCH', path, { title: 'Forbidden', milestone: milestone.id }],
		['DELETE', path],
		['PUT', `${path}/lock`],
		['DELETE', `${path}/lock`],
		['POST', `${path}/pin`],
		['DELETE', `${path}/pin`],
		['POST', `${path}/labels`, { labels: [label.id] }],
		['PUT', `${path}/labels`, { labels: [] }],
		['DELETE', `${path}/labels/${label.id}`],
		['DELETE', `${path}/labels`],
		['POST', `${path}/comments`, { body: 'Forbidden' }],
		['PATCH', commentPath, { body: 'Forbidden' }],
		['DELETE', commentPath],
		['POST', `${path}/reactions`, { content: 'heart' }],
		['DELETE', `${path}/reactions`, { content: 'eyes' }],
		['POST', `${commentPath}/reactions`, { content: 'heart' }],
		['DELETE', `${commentPath}/reactions`, { content: 'eyes' }],
		['PUT', `${path}/subscriptions/ada`],
		['DELETE', `${path}/subscriptions/ada`],
		['POST', `${base}/labels`, { name: 'new', color: 'ffffff' }],
		['PATCH', `${base}/labels/${label.id}`, { name: 'Changed' }],
		['DELETE', `${base}/labels/${label.id}`],
		['POST', `${base}/milestones`, { title: 'New' }],
		['PATCH', `${base}/milestones/${milestone.id}`, { title: 'Changed' }],
		['DELETE', `${base}/milestones/${milestone.id}`]
	];
	for (const [method, url, body] of writes) {
		expect(await call(ada, method, url, body)).toMatchObject({ status: 403, json: { message: 'ada/archive-check is archived' } });
	}
	expect((await call(other, 'PATCH', path, { body: 'Forbidden author edit' })).status).toBe(403);
	expect((await call(other, 'PATCH', commentPath, { body: 'Forbidden author edit' })).status).toBe(403);
	for (const url of [path, `${path}/comments`, `${path}/labels`, `${path}/reactions`, `${commentPath}/reactions`, `${base}/labels`, `${base}/milestones`]) {
		expect((await call(ada, 'GET', url)).status).toBe(200);
	}
	expect((await call(ada, 'GET', path)).json).toMatchObject({ title: 'Author edited', body: 'Edited body', milestone: null });
	expect((await call(ada, 'GET', commentPath)).json.body).toBe('Original comment');
	db.query('update repos set archived = 0 where id = ?').run(id);
	expect((await call(other, 'PATCH', path, { title: 'Writable again' })).status).toBe(200);
	expect((await call(other, 'PATCH', commentPath, { body: 'Writable again' })).status).toBe(200);
});

test('archived repos reject every pull mutation without changing refs, reviews or conversations', async () => {
	const id = await createRepo(db, root, ada, { name: 'archive-pulls', private: false });
	const dir = repoDir(root, id);
	const base = '/repos/ada/archive-pulls';
	const main = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\n' }], message: 'base', author });
	const head = await commitFiles(dir, { branch: 'feature', parent: main, newBranch: true, changes: [{ path: 'a.txt', content: 'one\ntwo\n' }], message: 'feature', author });
	await commitFiles(dir, { branch: 'next', parent: head, newBranch: true, changes: [{ path: 'b.txt', content: 'new\n' }], message: 'next', author });
	const opened = await call(other, 'POST', `${base}/pulls`, { base: 'main', head: 'feature', title: 'Reader pull' });
	expect(opened.status).toBe(201);
	const p = `${base}/pulls/${opened.json.number}`;
	expect((await call(other, 'PATCH', p, { title: 'Reader edited' })).status).toBe(200);
	const review = await call(other, 'POST', `${p}/reviews`, { event: 'PENDING' });
	expect(review.status).toBe(201);
	const submitted = await call(ada, 'POST', `${p}/reviews`, { event: 'COMMENT', body: 'Looks good', comments: [{ path: 'a.txt', new_position: 2, body: 'Line comment' }] });
	expect(submitted.status).toBe(201);
	const comment = (await call(other, 'GET', `${p}/comments`)).json[0];
	expect(comment.body).toBe('Line comment');
	expect((await call(other, 'POST', `${p}/requested_reviewers`, { reviewers: ['ada'] })).status).toBe(201);
	db.query('update repos set archived = 1 where id = ?').run(id);
	const snapshot = () => ['issues', 'pulls', 'reviews', 'comments', 'review_requests', 'events', 'revisions'].map((table) => db.query(`select * from ${table}`).all());
	const state = snapshot();
	const writes: [string, string, unknown?][] = [
		['POST', `${base}/pulls`, { base: 'main', head: 'next', title: 'Forbidden new pull' }],
		['PATCH', p, { title: 'Forbidden edit', draft: true }],
		['POST', `${p}/reviews`, { event: 'COMMENT', body: 'Forbidden review' }],
		['POST', `${p}/reviews`, { event: 'PENDING', comments: [{ path: 'a.txt', new_position: 2, body: 'Forbidden line comment' }] }],
		['POST', `${p}/reviews/${review.json.id}`, { event: 'COMMENT', body: 'Forbidden submit' }],
		['DELETE', `${p}/reviews/${review.json.id}`],
		['POST', `${p}/reviews/${submitted.json.id}/dismissals`, { message: 'Forbidden dismissal' }],
		['POST', `${base}/pulls/comments/${comment.id}/resolve`],
		['DELETE', `${base}/pulls/comments/${comment.id}/resolve`],
		['POST', `${p}/requested_reviewers`, { reviewers: ['other'] }],
		['DELETE', `${p}/requested_reviewers`, { reviewers: ['ada'] }],
		['POST', `${p}/merge`, { Do: 'merge' }],
		['POST', `${p}/merge`, { Do: 'merge', merge_when_checks_succeed: true }],
		['DELETE', `${p}/merge`],
		['POST', `${p}/update`],
		['POST', `${p}/update?style=rebase`],
		['POST', `${base}/issues/${opened.json.number}/comments`, { body: 'Forbidden reply', reply_to: comment.id }],
		['PATCH', `${base}/issues/comments/${comment.id}`, { body: 'Forbidden comment edit' }],
		['DELETE', `${base}/issues/comments/${comment.id}`]
	];
	const results = [];
	for (const [method, path, body] of writes) {
		const res = await call(path.includes('dismissals') || path.endsWith('/merge') ? ada : other, method, path, body);
		results.push([method, path, res.status, res.json?.message]);
	}
	expect(results).toEqual(writes.map(([method, path]) => [method, path, 403, 'ada/archive-pulls is archived']));
	expect(snapshot()).toEqual(state);
	const { doMerge, pullOf } = await import('./pulls.js');
	const r = { row: getRepo(db, 'ada', 'archive-pulls')!, level: 'admin' as const, dir, full: 'ada/archive-pulls' };
	const c = { db, user: getUser(db, ada), params: { index: String(opened.json.number) } } as never;
	await expect(doMerge(c, r, pullOf(c, r), { style: 'merge' })).rejects.toMatchObject({ status: 403, body: { message: 'ada/archive-pulls is archived' } });
	expect((await git(dir, ['rev-parse', 'main'])).trim()).toBe(main);
	expect((await git(dir, ['rev-parse', 'feature'])).trim()).toBe(head);
	for (const path of [p, `${base}/pulls`, `${p}/reviews`, `${p}/reviews/${review.json.id}`, `${p}/reviews/${submitted.json.id}/comments`, `${p}/comments`, `${base}/reviewers`, `${p}/files`, `${p}/commits`, `${p}/revisions`]) {
		expect([path, (await call(other, 'GET', path)).status]).toEqual([path, 200]);
	}
	expect((await call(other, 'GET', p)).json).toMatchObject({ title: 'Reader edited', merged: false, draft: false });
	db.query('update repos set archived = 0 where id = ?').run(id);
	expect((await call(other, 'PATCH', p, { title: 'Reader can edit again' })).status).toBe(200);
});

test('the UI open-pull action goes through the archive guard', async () => {
	const shared = await import('../shed.js');
	const { internalToken } = await import('./internal.js');
	const { actions } = await import('../../../routes/[owner]/[repo]/compare/[...spec]/+page.server.js');
	const userId = signIn(shared.db, { sub: crypto.randomUUID(), preferred_username: 'archive-ui' });
	const user = getUser(shared.db, userId)!;
	const id = await createRepo(shared.db, shared.root, userId, { name: 'pulls', private: false });
	const dir = repoDir(shared.root, id);
	const main = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\n' }], message: 'base', author });
	for (const branch of ['feature', 'next']) await commitFiles(dir, { branch, parent: main, newBranch: true, changes: [{ path: 'a.txt', content: `${branch}\n` }], message: branch, author });
	const open = (branch: string, title = 'UI pull') => {
		const form = new FormData();
		form.set('title', title);
		return actions.open({ locals: { user, token: internalToken(userId) }, params: { owner: user.login, repo: 'pulls', spec: `main...${branch}` }, request: new Request('http://shed/compare', { method: 'POST', body: form }) } as never);
	};
	expect(await open('feature', '')).toMatchObject({ status: 400, data: { error: 'Give it a title' } });
	await expect(open('feature')).rejects.toMatchObject({ status: 303, location: `/${user.login}/pulls/pulls/1` });
	shared.db.query('update repos set archived = 1 where id = ?').run(id);
	expect(await open('next')).toMatchObject({ status: 403, data: { action: 'open', error: `${user.login}/pulls is archived` } });
	expect(shared.db.query('select title from issues where repo_id = ?').all(id)).toEqual([{ title: 'UI pull' }]);
});

test('archived wiki and project UI writes are forbidden while their pages remain readable', async () => {
	const shared = await import('../shed.js');
	const wiki = await import('../../../routes/[owner]/[repo]/wiki/[[page]]/+page.server.js');
	const projects = await import('../../../routes/[owner]/[repo]/projects/+page.server.js');
	const project = await import('../../../routes/[owner]/[repo]/projects/[id]/+page.server.js');
	const userId = signIn(shared.db, { sub: crypto.randomUUID(), preferred_username: 'archive-boards' });
	const user = getUser(shared.db, userId)!;
	const id = await createRepo(shared.db, shared.root, userId, { name: 'wiki', private: false });
	const event = (fields: Record<string, string> = {}) => {
		const form = new FormData();
		for (const [k, v] of Object.entries(fields)) form.set(k, v);
		return { locals: { user }, params: { owner: user.login, repo: 'wiki', page: 'Home', id: '0' }, request: new Request('http://shed/wiki', { method: 'POST', body: form }), url: new URL('http://shed/wiki') } as never;
	};
	await expect(wiki.actions.save(event({ title: 'Home', text: 'Original' }))).rejects.toMatchObject({ status: 303 });
	await expect(projects.actions.create(event({ title: 'Board' }))).rejects.toMatchObject({ status: 303 });
	const p = shared.db.query<{ id: number }, [number]>('select id from projects where repo_id = ?').get(id)!;
	shared.db.query('update repos set archived = 1 where id = ?').run(id);
	for (const [action, form] of [[wiki.actions.save, { title: 'Home', text: 'Forbidden' }], [wiki.actions.delete, {}], [projects.actions.create, { title: 'Forbidden' }], ...Object.values(project.actions).map((action) => [action, {}])] as const) {
		const e = event(form) as any;
		e.params.id = String(p.id);
		await expect(action(e)).rejects.toMatchObject({ status: 403, body: { message: `${user.login}/wiki is archived` } });
	}
	expect((await wiki.load(event())).page?.markdown).toBe('Original');
	expect(projects.load(event()).projects).toHaveLength(1);
	const e = event() as any;
	e.params.id = String(p.id);
	expect(project.load(e).project.title).toBe('Board');
});

test('archive audit: releases, assets, branch protection, wiki and branch deletion already reject writes', async () => {
	const id = await createRepo(db, root, ada, { name: 'archive-audit', private: false });
	const base = '/repos/ada/archive-audit';
	const dir = repoDir(root, id);
	const main = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\n' }], message: 'base', author });
	expect((await call(ada, 'POST', `${base}/branches`, { new_branch_name: 'spare' })).status).toBe(201);
	const release = await call(ada, 'POST', `${base}/releases`, { tag_name: 'v1' });
	expect(release.status).toBe(201);
	const form = new FormData();
	form.set('attachment', new File(['bytes'], 'a.bin'));
	const asset = await call(ada, 'POST', `${base}/releases/${release.json.id}/assets`, form);
	expect(asset.status).toBe(201);
	expect((await call(ada, 'POST', `${base}/branch_protections`, { rule_name: 'main' })).status).toBe(201);
	expect((await call(ada, 'POST', `${base}/wiki/new`, { title: 'Home', content: 'Original' })).status).toBe(201);
	db.query('update repos set archived = 1 where id = ?').run(id);
	const rel = `${base}/releases/${release.json.id}`;
	const writes: [string, string, unknown?][] = [
		['POST', `${base}/releases`, { tag_name: 'v2' }],
		['PATCH', rel, { name: 'Forbidden' }],
		['DELETE', rel],
		['POST', `${rel}/assets`, form],
		['DELETE', `${rel}/assets/${asset.json.id}`],
		['POST', `${base}/branch_protections`, { rule_name: 'spare' }],
		['PATCH', `${base}/branch_protections/main`, { required_approvals: 2 }],
		['DELETE', `${base}/branch_protections/main`],
		['POST', `${base}/wiki/new`, { title: 'New', content: 'Forbidden' }],
		['PATCH', `${base}/wiki/page/Home`, { content: 'Forbidden' }],
		['DELETE', `${base}/wiki/page/Home`],
		['DELETE', `${base}/branches/spare`]
	];
	for (const [method, path, body] of writes) expect(await call(ada, method, path, body)).toMatchObject({ status: 403, json: { message: 'ada/archive-audit is archived' } });
	for (const path of [`${base}/releases`, rel, `${base}/branch_protections`, `${base}/wiki/pages`, `${base}/wiki/page/Home`, `${base}/branches`]) expect((await call(other, 'GET', path)).status).toBe(200);
	expect((await git(dir, ['rev-parse', 'spare'])).trim()).toBe(main);
	expect((await call(other, 'GET', rel)).json.assets).toHaveLength(1);
	expect((await call(other, 'GET', `${base}/wiki/page/Home`)).json.content).toBe('Original');
});
