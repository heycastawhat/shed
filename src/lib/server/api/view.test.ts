import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { openDb } from '../db.js';
import { createRepo, repoDir } from '../repos.js';
import { commitFiles } from '../write.js';
import { testEnv } from '../test-env.js';

// The endpoints the Android app draws code from: highlight tokens and blame.

let root: string, db: Database, owner: number;
let dispatch: typeof import('./index.js').dispatch;
mock.module('$app/env/private', testEnv);

const call = async (method: string, path: string, body?: unknown) => {
	const res = await dispatch(db, root, 'http://shed', new Request(`http://shed/api/v1${path}`, { method, body: body && JSON.stringify(body), headers: body ? { 'content-type': 'application/json' } : {} }), {
		user: getUser(db, owner)!,
		token: null
	});
	return { status: res.status, json: await res.json() };
};

beforeAll(async () => {
	({ dispatch } = await import('./index.js'));
	root = await mkdtemp(`${tmpdir()}/shed-view-`);
	db = openDb(':memory:');
	owner = signIn(db, { sub: '1', preferred_username: 'ada' });
	const id = await createRepo(db, root, owner, { name: 'garden' });
	const author = { name: 'Ada', email: 'ada@example.com' };
	const first = await commitFiles(repoDir(root, id), { branch: 'main', parent: null, changes: [{ path: 'a.ts', content: 'const a = 1;\nconst b = 2;\n' }], message: 'First', author });
	await commitFiles(repoDir(root, id), { branch: 'main', parent: first, changes: [{ path: 'a.ts', content: 'const a = 1;\nconst b = 3;\n' }], message: 'Second', author });
});
afterAll(() => rm(root, { recursive: true, force: true }));

test('highlight gives each line its tokens with light and dark colours', async () => {
	const r = await call('POST', '/highlight', { filename: 'src/x.ts', lines: ['const a = 1;', '// done'] });
	expect(r.json.lang).toBe('typescript');
	expect(r.json.lines[0].map((t: { t: string }) => t.t).join('')).toBe('const a = 1;');
	expect(r.json.lines[0][0]).toMatchObject({ t: 'const', l: expect.stringMatching(/^#/), d: expect.stringMatching(/^#/) });
	expect((await call('POST', '/highlight', { filename: 'notes', lines: ['plain'] })).json).toEqual({ lang: 'text', lines: [[{ t: 'plain' }]] });
});

test('blame says which commit last touched each line', async () => {
	const r = await call('GET', '/repos/ada/garden/blame/a.ts');
	expect(r.json.lines).toEqual(['const a = 1;', 'const b = 3;']);
	expect(r.json.ranges.map((x: { start: number; count: number }) => [x.start, x.count])).toEqual([[1, 1], [2, 1]]);
	const [one, two] = r.json.ranges.map((x: { sha: string }) => r.json.commits[x.sha].summary);
	expect([one, two]).toEqual(['First', 'Second']);
	expect((await call('GET', '/repos/ada/garden/blame/nope.ts')).status).toBe(404);
});
