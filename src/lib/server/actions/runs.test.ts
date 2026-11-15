import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openDb } from '../db.js';
import { createRepo, repoDir } from '../repos.js';
import { commitFiles } from '../write.js';
import { trigger } from './runs.js';

const root = await mkdtemp(`${tmpdir()}/shed-runs-`);
afterAll(() => rm(root, { recursive: true }));

test('a dispatched run resolves runs-on from repo vars and inputs', async () => {
	const db = openDb(':memory:');
	const owner = Number(db.query("insert into users (login) values ('ada')").run().lastInsertRowid);
	const id = await createRepo(db, root, owner, { name: 'ci' });
	db.query("insert into action_vars (repo_id, name, value) values (?, 'RUNNER', 'host')").run(id);
	const yml = 'on:\n  workflow_dispatch:\n    inputs: { pool: { default: small } }\njobs:\n  a: { runs-on: "${{ vars.RUNNER }}", steps: [{ run: x }] }\n  b: { runs-on: ["${{ inputs.pool }}", arm], steps: [{ run: x }] }\n';
	const author = { name: 'Ada', email: 'ada@example.com' };
	const sha = await commitFiles(repoDir(root, id), { branch: 'main', parent: null, changes: [{ path: '.forgejo/workflows/ci.yml', content: yml }], message: 'ci', author });
	await trigger(db, root, id, { event: 'workflow_dispatch', ref: 'refs/heads/main', sha, userId: owner, title: 'ci', payload: { inputs: {} } });
	expect(db.query('select job_key, runs_on from jobs order by job_key').all()).toEqual([
		{ job_key: 'a', runs_on: '["host"]' },
		{ job_key: 'b', runs_on: '["small","arm"]' }
	]);
});
