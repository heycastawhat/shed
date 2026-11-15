import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { openDb } from '../db.js';
import { git } from '../git.js';
import { createRepo, repoDir } from '../repos.js';
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
