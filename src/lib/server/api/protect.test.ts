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

// Branch rules apply to the writes Shed makes for people (file edits, branch create/delete), as they do to git pushes.

let root: string, db: Database, ada: number, other: number, repoId: number;
let dispatch: typeof import('./index.js').dispatch;
const scratch = `${tmpdir()}/shed-protect-env-${crypto.randomUUID()}`;
mock.module('$app/env/private', testEnv);
const author = { name: 'Ada', email: 'ada@x' };
const b64 = (s: string) => new TextEncoder().encode(s).toBase64();

async function call(as: number, method: string, path: string, body?: unknown) {
	const init: RequestInit = { method, ...(body !== undefined && { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) };
	const res = await dispatch(db, root, 'http://shed', new Request(`http://shed/api/v1${path}`, init), { user: getUser(db, as)!, token: null });
	return { status: res.status, json: res.status === 204 ? null : await res.json() };
}

beforeAll(async () => {
	({ dispatch } = await import('./index.js'));
	root = await mkdtemp(`${tmpdir()}/shed-protect-`);
	db = openDb(':memory:');
	ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	other = signIn(db, { sub: '2', preferred_username: 'other' });
	repoId = await createRepo(db, root, ada, { name: 'sample' });
	const dir = repoDir(root, repoId);
	const base = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\n' }], message: 'first', author });
	await commitFiles(dir, { branch: 'release/1', parent: base, changes: [], message: 'release', author, newBranch: true });
	await commitFiles(dir, { branch: 'scratch', parent: base, changes: [], message: 'scratch', author, newBranch: true });
	db.query("insert into collaborators (repo_id, user_id, permission) values (?, ?, 'write')").run(repoId, other);
	expect((await call(ada, 'POST', '/repos/ada/sample/branch_protections', { rule_name: 'main', enable_push: false })).status).toBe(201);
	expect((await call(ada, 'POST', '/repos/ada/sample/branch_protections', { rule_name: 'release/*', enable_push: true, enable_push_whitelist: true })).status).toBe(201);
});
afterAll(() => Promise.all([rm(root, { recursive: true }), rm(scratch, { recursive: true, force: true })]));

test('file writes to a branch nobody may push to are refused, even for admins; a new branch is fine', async () => {
	const put = await call(ada, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('two\n'), branch: 'main' });
	expect(put).toMatchObject({ status: 403, json: { message: 'main is a protected branch: push changes through a pull request' } });
	expect((await call(ada, 'POST', '/repos/ada/sample/contents/new.txt', { content: b64('x'), branch: 'main' })).status).toBe(403);
	expect((await call(ada, 'DELETE', '/repos/ada/sample/contents/a.txt', { branch: 'main' })).status).toBe(403);
	expect((await call(ada, 'POST', '/repos/ada/sample/contents', { branch: 'main', files: [{ operation: 'create', path: 'b.txt', content: b64('b') }] })).status).toBe(403);
	expect((await call(ada, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('two\n'), branch: 'main', new_branch: 'fix' })).status).toBe(200);
	expect((await call(ada, 'POST', '/repos/ada/sample/contents', { branch: 'main', new_branch: 'fix-2', files: [{ operation: 'create', path: 'b.txt', content: b64('b') }] })).status).toBe(201);
	// A new branch that falls under a rule is a push to it.
	expect((await call(other, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('two\n'), branch: 'main', new_branch: 'release/2' })).status).toBe(403);
});

test('admin-only branches take writes from admins only', async () => {
	const res = await call(other, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('rel\n'), branch: 'release/1' });
	expect(res).toMatchObject({ status: 403, json: { message: 'release/1 is a protected branch: only repo admins can push to it' } });
	expect((await call(other, 'POST', '/repos/ada/sample/contents', { branch: 'release/1', files: [{ operation: 'create', path: 'c.txt', content: b64('c') }] })).status).toBe(403);
	expect((await call(ada, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('rel\n'), branch: 'release/1' })).status).toBe(200);
	expect((await call(other, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('s\n'), branch: 'scratch' })).status).toBe(200);
});

test('branches: protected ones can be neither deleted nor created by those who may not push to them', async () => {
	expect((await call(ada, 'DELETE', '/repos/ada/sample/branches/release/1')).json.message).toBe("release/1 is a protected branch, so it can't be deleted");
	expect((await call(other, 'POST', '/repos/ada/sample/branches', { new_branch_name: 'release/3', old_branch_name: 'main' })).status).toBe(403);
	expect((await call(ada, 'POST', '/repos/ada/sample/branches', { new_branch_name: 'release/3', old_branch_name: 'main' })).status).toBe(201);
	expect((await call(other, 'DELETE', '/repos/ada/sample/branches/scratch')).status).toBe(204);
});

test("a pull mirror's refs can't be written through the API", async () => {
	db.query("update repos set mirror_url = 'https://example.com/x.git' where id = ?").run(repoId);
	const why = { status: 403, json: { message: 'ada/sample is a mirror; push to the repo it copies' } };
	expect(await call(ada, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('m\n'), branch: 'scratch-2' })).toMatchObject({ status: 404 });
	expect(await call(ada, 'PUT', '/repos/ada/sample/contents/a.txt', { content: b64('m\n'), branch: 'fix' })).toMatchObject(why);
	expect(await call(ada, 'POST', '/repos/ada/sample/contents', { branch: 'fix', files: [{ operation: 'create', path: 'm.txt', content: b64('m') }] })).toMatchObject(why);
	expect(await call(ada, 'POST', '/repos/ada/sample/branches', { new_branch_name: 'm', old_branch_name: 'main' })).toMatchObject(why);
	expect(await call(ada, 'DELETE', '/repos/ada/sample/branches/fix')).toMatchObject(why);
	expect(await call(ada, 'POST', '/repos/ada/sample/tags', { tag_name: 'v1' })).toMatchObject(why);
	expect(await call(ada, 'DELETE', '/repos/ada/sample/tags/v1')).toMatchObject(why);
	// Releases are only metadata, so they're fine for tags the mirror already has; making a tag is refused.
	await git(repoDir(root, repoId), ['tag', 'v0', 'main']);
	expect(await call(ada, 'POST', '/repos/ada/sample/releases', { tag_name: 'v0' })).toMatchObject({ status: 201 });
	expect(await call(ada, 'POST', '/repos/ada/sample/releases', { tag_name: 'v2' })).toMatchObject(why);
	const draft = await call(ada, 'POST', '/repos/ada/sample/releases', { tag_name: 'v2', draft: true });
	expect(draft.status).toBe(201);
	expect(await call(ada, 'PATCH', `/repos/ada/sample/releases/${draft.json.id}`, { draft: false })).toMatchObject(why);
	expect(await git(repoDir(root, repoId), ['tag', '-l'])).toBe('v0\n');
	db.query('update repos set mirror_url = null where id = ?').run(repoId);
});
