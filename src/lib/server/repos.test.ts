import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { openDb } from './db.js';
import { git } from './git.js';
import { createRepo, deleteRepo, getRepo, listRepos, renameIn, repoDir } from './repos.js';

let root: string, db: Database, ada: number;
beforeEach(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-`);
	db = openDb(`${root}/shed.db`);
	ada = Number(db.query("insert into users (login) values ('ada')").run().lastInsertRowid);
});
afterEach(() => rm(root, { recursive: true }));

test('migrations run once and reopening is a no-op', () => {
	db.close();
	db = openDb(`${root}/shed.db`);
	expect(db.query('pragma user_version').get()).toEqual({ user_version: 12 });
});

test('refuses a database from a newer build', () => {
	db.run('pragma user_version = 99');
	db.close();
	expect(() => openDb(`${root}/shed.db`)).toThrow(/newer Shed/);
	db = openDb(':memory:');
});

test('creates a bare repo with the default branch', async () => {
	const id = await createRepo(db, root, ada, { name: 'sample', description: 'Test' });
	expect(await git(repoDir(root, id), ['symbolic-ref', 'HEAD'])).toBe('refs/heads/main\n');
	expect(await git(repoDir(root, id), ['rev-parse', '--is-bare-repository'])).toBe('true\n');
	expect(getRepo(db, 'ADA', 'Sample')).toMatchObject({ id, owner: 'ada', name: 'sample', private: 1, default_branch: 'main' });
	expect(listRepos(db, ada)).toHaveLength(1);
});

test('refuses bad and duplicate names', async () => {
	for (const name of ['', '.', '..', '.hidden', '-x', 'a/b', 'a b', 'x.git', 'a'.repeat(101)])
		await expect(createRepo(db, root, ada, { name })).rejects.toMatchObject({ status: 400 });
	await expect(createRepo(db, root, ada, { name: 'ok', defaultBranch: '../x' })).rejects.toMatchObject({ status: 400 });
	await createRepo(db, root, ada, { name: 'sample' });
	await expect(createRepo(db, root, ada, { name: 'SAMPLE' })).rejects.toMatchObject({ status: 409 });
	expect(await readdir(`${root}/repos`)).toHaveLength(1);
});

test('delete moves the git data to trash', async () => {
	const id = await createRepo(db, root, ada, { name: 'sample' });
	await deleteRepo(db, root, id);
	expect(getRepo(db, 'ada', 'sample')).toBeNull();
	expect(await readdir(`${root}/repos`)).toHaveLength(0);
	expect(await readdir(`${root}/trash`)).toHaveLength(1);
});

test('commitFiles writes without a checkout and refuses a stale parent', async () => {
	const { commitFiles } = await import('./write.js');
	const id = await createRepo(db, root, ada, { name: 'w' });
	const dir = repoDir(root, id);
	const me = { name: 'Ada', email: 'j@x.nz' };
	const first = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'README.md', content: '# w\n' }, { path: 'src/a.ts', content: 'x' }], message: 'Init', author: me });
	const second = await commitFiles(dir, { branch: 'main', parent: first, changes: [{ path: 'src/a.ts', content: null }, { path: 'b.txt', content: 'b' }], message: 'Edit', author: me });
	expect(await git(dir, ['ls-tree', '-r', '--name-only', 'main'])).toBe('README.md\nb.txt\n');
	expect(await git(dir, ['log', '--format=%s %an', 'main'])).toBe('Edit Ada\nInit Ada\n');
	await expect(commitFiles(dir, { branch: 'main', parent: first, changes: [{ path: 'c', content: 'c' }], message: 'Stale', author: me })).rejects.toThrow();
	await expect(commitFiles(dir, { branch: 'main', parent: second, changes: [{ path: '../x', content: 'c' }], message: 'Bad', author: me })).rejects.toThrow(/Invalid path/);
	expect((await git(dir, ['rev-parse', 'main'])).trim()).toBe(second);
});

test('renameIn swaps owner/name ignoring case and keeps the rest', () => {
	expect(renameIn(['*', 'Ada/App', 'ada/other'], 'ada/app', 'kiwi/app')).toEqual(['*', 'kiwi/app', 'ada/other']);
});
