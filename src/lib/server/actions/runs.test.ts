import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openDb } from '../db.js';
import { createRepo, repoDir } from '../repos.js';
import { commitFiles } from '../write.js';
import { finishJob, rerun, trigger } from './runs.js';

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

test('a dependent of a fully excluded matrix becomes runnable without another job starting', async () => {
	const db = openDb(':memory:');
	const dir = await mkdtemp(`${root}/excluded-`);
	const owner = Number(db.query("insert into users (login) values ('ada')").run().lastInsertRowid);
	const id = await createRepo(db, dir, owner, { name: 'ci' });
	const yml = 'on: workflow_dispatch\njobs:\n  excluded:\n    runs-on: host\n    strategy:\n      matrix:\n        os: [linux]\n        exclude: [{ os: linux }]\n    steps: [{ run: x }]\n  dependent:\n    needs: excluded\n    runs-on: host\n    steps: [{ run: x }]\n';
	const sha = await commitFiles(repoDir(dir, id), {
		branch: 'main', parent: null, changes: [{ path: '.forgejo/workflows/ci.yml', content: yml }], message: 'ci', author: { name: 'Ada', email: 'ada@example.com' }
	});
	const [run] = await trigger(db, dir, id, { event: 'workflow_dispatch', ref: 'refs/heads/main', sha, userId: owner, title: 'ci', payload: {} });
	expect(db.query('select job_key, status from jobs where run_id = ?').all(run)).toEqual([{ job_key: 'dependent', status: 'waiting' }]);
	const job = db.query<{ id: number }, [number]>('select id from jobs where run_id = ?').get(run)!;
	finishJob(db, job.id, 'success');
	expect(db.query('select status from runs where id = ?').get(run)).toEqual({ status: 'success' });
});

test.each([
	['a missing need', '  missing_dependency: { needs: does_not_exist, runs-on: host, steps: [{ run: x }] }\n'],
	['a missing need alongside a valid need', '  independent: { runs-on: host, steps: [{ run: x }] }\n  missing_dependency: { needs: [independent, does_not_exist], runs-on: host, steps: [{ run: x }] }\n'],
	['a missing need on a zero-instance job', '  missing_dependency:\n    needs: does_not_exist\n    runs-on: host\n    strategy: { matrix: { os: [] } }\n    steps: [{ run: x }]\n']
])('invalid dependencies reject the entire workflow: %s', async (_, jobs) => {
	const db = openDb(':memory:');
	const dir = await mkdtemp(`${root}/invalid-`);
	const owner = Number(db.query("insert into users (login) values ('ada')").run().lastInsertRowid);
	const id = await createRepo(db, dir, owner, { name: 'ci' });
	const yml = `name: Invalid\non: workflow_dispatch\njobs:\n${jobs}`;
	const sha = await commitFiles(repoDir(dir, id), { branch: 'main', parent: null, changes: [{ path: '.forgejo/workflows/invalid.yml', content: yml }], message: 'ci', author: { name: 'Ada', email: 'ada@example.com' } });
	const made = await trigger(db, dir, id, { event: 'workflow_dispatch', ref: 'refs/heads/main', sha, userId: owner, title: 'ci', payload: {} });
	expect(made).toHaveLength(1);
	const [run] = made;
	expect(db.query('select status from runs where id = ?').get(run)).toEqual({ status: 'failure' });
	const error = "Job 'missing_dependency' depends on unknown job 'does_not_exist'";
	expect(db.query('select name, status, result, task_id from jobs where run_id = ?').all(run)).toEqual([{ name: error, status: 'failure', result: 'failure', task_id: null }]);
	expect(db.query("select count(*) as n from jobs where run_id = ? and status in ('waiting', 'blocked', 'running')").get(run)).toEqual({ n: 0 });
	expect(db.query('select state, description from statuses where repo_id = ?').all(id)).toEqual([{ state: 'failure', description: error }]);
	for (const failedOnly of [false, true]) expect(() => rerun(db, run, failedOnly)).toThrow(error);
	expect(db.query('select status, attempt from runs where id = ?').get(run)).toEqual({ status: 'failure', attempt: 1 });
});
