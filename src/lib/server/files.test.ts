import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { allPaths, blame, branches, tags } from './browse.js';
import { openDb } from './db.js';
import { planChanges } from './files.js';
import { forkParent, forkRepo } from './fork.js';
import { git } from './git.js';
import { createRepo, getRepo, repoDir } from './repos.js';
import { commitFiles } from './write.js';

let root: string, db: Database, ada: number, dir: string, first: string;
const me = { name: 'Ada', email: 'j@x.nz' };
const b64 = (s: string) => new TextEncoder().encode(s).toBase64();
const show = (rev: string) => git(dir, ['show', rev]);

beforeEach(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-`);
	db = openDb(`${root}/shed.db`);
	ada = Number(db.query("insert into users (login) values ('ada')").run().lastInsertRowid);
	dir = repoDir(root, await createRepo(db, root, ada, { name: 'sample' }));
	first = await commitFiles(dir, {
		branch: 'main',
		parent: null,
		changes: [
			{ path: 'README.md', content: '# s\n' },
			{ path: 'src/a.ts', content: 'a\n' },
			{ path: 'run.sh', content: '#!/bin/sh\n', mode: '100755' }
		],
		message: 'Init',
		author: me
	});
});
afterEach(() => rm(root, { recursive: true }));

test('planChanges turns uploads, edits, renames and deletes into one commit', async () => {
	const changes = await planChanges(dir, first, [
		{ operation: 'create', path: 'docs/new.md', content: b64('new\n') },
		{ operation: 'update', path: 'run.sh', content: b64('#!/bin/sh\necho\n') },
		{ operation: 'update', path: 'lib/a.ts', from_path: 'src/a.ts', content: b64('a2\n') },
		{ operation: 'delete', path: 'README.md' }
	]);
	const sha = await commitFiles(dir, { branch: 'main', parent: first, changes, message: 'Many', author: me });
	expect((await allPaths(dir, sha)).sort()).toEqual(['docs/new.md', 'lib/a.ts', 'run.sh']);
	expect(await show(`${sha}:lib/a.ts`)).toBe('a2\n');
	// An edit keeps the executable bit.
	expect(await git(dir, ['ls-tree', sha, 'run.sh'])).toStartWith('100755');
});

test('planChanges refuses conflicts, stale edits and bad paths', async () => {
	const blob = (await git(dir, ['rev-parse', `${first}:src/a.ts`])).trim();
	const cases: [Parameters<typeof planChanges>[2], number][] = [
		[[], 422],
		[[{ operation: 'create', path: 'README.md', content: '' }], 422],
		[[{ operation: 'create', path: 'src', content: '' }], 422],
		[[{ operation: 'create', path: 'README.md/x', content: '' }], 422],
		[[{ operation: 'update', path: 'nope.txt', content: '' }], 404],
		[[{ operation: 'update', path: 'src/a.ts', content: '', sha: 'f'.repeat(40) }], 409],
		[[{ operation: 'update', path: 'README.md', from_path: 'src/a.ts', content: '' }], 422],
		[[{ operation: 'delete', path: 'src' }], 404],
		[[{ operation: 'create', path: 'x', content: '' }, { operation: 'create', path: 'x', content: '' }], 422],
		[[{ operation: 'create', path: 'not base64', content: '%%%' }], 400]
	];
	for (const [ops, status] of cases) await expect(planChanges(dir, first, ops)).rejects.toMatchObject({ status });
	for (const path of ['', '../x', 'a/../b', '/abs', 'a//b', '.git/config', 'a\\b', 'a\nb'])
		await expect(planChanges(dir, first, [{ operation: 'create', path, content: '' }])).rejects.toMatchObject({ status: 422 });
	expect(await planChanges(dir, first, [{ operation: 'update', path: 'src/a.ts', content: '', sha: blob }])).toHaveLength(1);
});

test('blame groups consecutive lines by commit', async () => {
	const second = await commitFiles(dir, { branch: 'main', parent: first, changes: [{ path: 'src/a.ts', content: 'a\nb\nc\n' }], message: 'More lines\n\nBody', author: { name: 'Bot', email: 'bot@x.nz' } });
	const third = await commitFiles(dir, { branch: 'main', parent: second, changes: [{ path: 'src/a.ts', content: 'a\nB\nc\n' }], message: 'Fix b', author: me });
	const { commits, ranges } = await blame(dir, third, 'src/a.ts');
	expect(ranges).toEqual([
		{ sha: first, start: 1, count: 1 },
		{ sha: third, start: 2, count: 1 },
		{ sha: second, start: 3, count: 1 }
	]);
	expect(commits[second]).toMatchObject({ author: 'Bot', email: 'bot@x.nz', summary: 'More lines' });
	expect(commits[first].time).toBeGreaterThan(0);
});

test('a fork copies every branch and tag and remembers its source', async () => {
	await git(dir, ['branch', 'feature', first]);
	await git(dir, ['tag', 'v1', first]);
	const source = getRepo(db, 'ada', 'sample')!;
	db.query('update repos set private = 0 where id = ?').run(source.id);
	const reviewer = Number(db.query("insert into users (login) values ('reviewer')").run().lastInsertRowid);
	const fork = await forkRepo(db, root, { ...source, private: 0 }, reviewer, 'sample-fork');
	const fdir = repoDir(root, fork.id);
	expect(fork).toMatchObject({ owner: 'reviewer', name: 'sample-fork', private: 0, default_branch: 'main' });
	expect((await branches(fdir)).map((b) => [b.name, b.sha]).sort()).toEqual([['feature', first], ['main', first]]);
	expect((await tags(fdir)).map((t) => t.name)).toEqual(['v1']);
	expect(forkParent(db, fork.id)).toEqual({ owner: 'ada', name: 'sample' });
	expect(forkParent(db, source.id)).toBeNull();
	await expect(forkRepo(db, root, source, reviewer, 'sample-fork')).rejects.toMatchObject({ status: 409 });
});
