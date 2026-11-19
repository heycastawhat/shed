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

// PRs from forks: opening one, and "Update branch" writing to the fork's branch.

let root: string, db: Database, ada: number, other: number, third: number, baseDir: string, forkDir: string;
let dispatch: typeof import('./index.js').dispatch;
const scratch = `${tmpdir()}/shed-forkpr-env-${crypto.randomUUID()}`;
mock.module('$app/env/private', testEnv);
const author = { name: 'Ada', email: 'ada@x' };

async function call(as: number, method: string, path: string, body?: unknown) {
	const init: RequestInit = { method, ...(body !== undefined && { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) };
	const res = await dispatch(db, root, 'http://shed', new Request(`http://shed/api/v1${path}`, init), { user: getUser(db, as)!, token: null });
	return { status: res.status, json: res.status === 204 ? null : await res.json() };
}
const sha = async (dir: string, ref: string) => (await git(dir, ['rev-parse', ref])).trim();

beforeAll(async () => {
	({ dispatch } = await import('./index.js'));
	root = await mkdtemp(`${tmpdir()}/shed-forkpr-`);
	db = openDb(':memory:');
	ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	other = signIn(db, { sub: '2', preferred_username: 'other' });
	third = signIn(db, { sub: '3', preferred_username: 'third' });
	const id = await createRepo(db, root, ada, { name: 'sample', private: false });
	baseDir = repoDir(root, id);
	db.query("insert into collaborators (repo_id, user_id, permission) values (?, ?, 'write')").run(id, third);
	await commitFiles(baseDir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\n' }], message: 'first', author });
	expect((await call(other, 'POST', '/repos/ada/sample/forks', {})).status).toBe(201);
	forkDir = repoDir(root, getRepo(db, 'other', 'sample')!.id);
	await commitFiles(forkDir, { branch: 'feature', parent: await sha(forkDir, 'main'), changes: [{ path: 'b.txt', content: 'b\n' }], message: 'feature', author, newBranch: true });
	await commitFiles(baseDir, { branch: 'main', parent: await sha(baseDir, 'main'), changes: [{ path: 'c.txt', content: 'c\n' }], message: 'main moves', author });
});
afterAll(() => Promise.all([rm(root, { recursive: true }), rm(scratch, { recursive: true, force: true })]));

test('forks are listed and a PR opens from one', async () => {
	expect((await call(ada, 'GET', '/repos/ada/sample/forks')).json.map((f: { full_name: string }) => f.full_name)).toEqual(['other/sample']);
	const pr = await call(other, 'POST', '/repos/ada/sample/pulls', { head: 'other:feature', base: 'main', title: 'From a fork' });
	expect(pr).toMatchObject({ status: 201, json: { number: 1, head: { label: 'other:feature', repo: { full_name: 'other/sample' } } } });
});

test("updating a fork PR writes the fork's branch and moves the PR", async () => {
	const head = await sha(forkDir, 'refs/heads/feature');
	// Write access to the base repo isn't write access to the fork.
	expect((await call(third, 'POST', '/repos/ada/sample/pulls/1/update')).status).toBe(403);
	expect((await call(other, 'POST', '/repos/ada/sample/pulls/1/update')).status).toBe(204);
	const next = await sha(forkDir, 'refs/heads/feature');
	expect(next).not.toBe(head);
	expect((await git(forkDir, ['rev-list', '--parents', '-1', next])).trim().split(' ').slice(1)).toEqual([head, await sha(baseDir, 'main')]);
	expect(await sha(baseDir, 'refs/pull/1/head')).toBe(next);
	expect((await call(ada, 'GET', '/repos/ada/sample/pulls/1')).json.head.sha).toBe(next);
	expect(await git(forkDir, ['for-each-ref', 'refs/shed'])).toBe('');
	expect(await git(baseDir, ['for-each-ref', 'refs/shed'])).toBe('');
	expect((await call(ada, 'GET', '/repos/ada/sample/pulls/1/revisions')).json).toHaveLength(2);
});

test("the fork's branch rules apply: a rebase is a force push", async () => {
	await commitFiles(baseDir, { branch: 'main', parent: await sha(baseDir, 'main'), changes: [{ path: 'd.txt', content: 'd\n' }], message: 'again', author });
	expect((await call(other, 'POST', '/repos/other/sample/branch_protections', { rule_name: 'feature', enable_push: true })).status).toBe(201);
	const res = await call(other, 'POST', '/repos/ada/sample/pulls/1/update?style=rebase');
	expect(res).toMatchObject({ status: 403, json: { message: 'feature is a protected branch, so force pushes to it are refused' } });
	expect((await call(other, 'POST', '/repos/ada/sample/pulls/1/update')).status).toBe(204);
});

test('fork pushes while the base is archived are included when merging after unarchiving', async () => {
	const before = (await call(other, 'GET', '/repos/ada/sample/pulls/1')).json;
	const revisions = (await call(other, 'GET', '/repos/ada/sample/pulls/1/revisions')).json;
	db.query('update repos set archived = 1 where id = ?').run(getRepo(db, 'ada', 'sample')!.id);
	expect(await call(other, 'POST', '/repos/ada/sample/pulls/1/update')).toMatchObject({ status: 403, json: { message: 'ada/sample is archived' } });
	expect((await call(other, 'POST', '/repos/other/sample/contents', { branch: 'feature', message: 'fork moves', files: [{ operation: 'create', path: 'new.txt', content: btoa('new\n') }] })).status).toBe(201);
	const newest = await sha(forkDir, 'feature');
	expect(newest).not.toBe(before.head.sha);
	const tracked = (await call(other, 'GET', '/repos/ada/sample/pulls/1')).json.head.sha;
	expect((await call(ada, 'POST', '/repos/ada/sample/pulls/1/merge', { Do: 'merge' })).status).toBe(403);
	expect((await call(ada, 'PATCH', '/repos/ada/sample', { archived: false })).status).toBe(200);
	expect((await call(ada, 'POST', '/repos/ada/sample/pulls/1/merge', { Do: 'merge' })).status).toBe(204);
	expect((await git(baseDir, ['merge-base', 'main', newest])).trim()).toBe(newest);
	expect(await git(baseDir, ['show', 'main:new.txt'])).toBe('new\n');
	expect(tracked).toBe(newest);
	expect(await sha(baseDir, 'refs/pull/1/head')).toBe(newest);
	expect((await call(other, 'GET', '/repos/ada/sample/pulls/1/revisions')).json).toHaveLength(revisions.length + 1);
});
