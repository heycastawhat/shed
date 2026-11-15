import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { openDb } from './db.js';
import { git } from './git.js';
import { createRepo, deleteRepo, getRepo, listRepos, repoDir } from './repos.js';

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
	expect(db.query('pragma user_version').get()).toEqual({ user_version: 2 });
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
