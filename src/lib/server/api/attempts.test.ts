import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { logPath, trigger } from '../actions/runs.js';
import { openDb } from '../db.js';
import { createRepo, repoDir } from '../repos.js';
import { commitFiles } from '../write.js';
import { testEnv } from '../test-env.js';

// A re-run job keeps its earlier attempts' tasks and logs.

let root: string, db: Database, ada: number, job: number, other: number;
let dispatch: typeof import('./index.js').dispatch;
const scratch = `${tmpdir()}/shed-attempts-env-${crypto.randomUUID()}`;
mock.module('$app/env/private', testEnv);

async function call(path: string, method = 'GET') {
	const res = await dispatch(db, root, 'http://shed', new Request(`http://shed/api/v1${path}`, { method }), { user: getUser(db, ada)!, token: null });
	return { status: res.status, text: await res.text() };
}
const task = async (jobId: number, status: string, log: string) => {
	const id = Number(db.query("insert into tasks (job_id, token_hash, status, steps) values (?, ?, ?, '[]')").run(jobId, crypto.randomUUID(), status).lastInsertRowid);
	await mkdir(logPath(root, id).replace(/\/[^/]+$/, ''), { recursive: true });
	await Bun.write(logPath(root, id), log);
	return id;
};

beforeAll(async () => {
	({ dispatch } = await import('./index.js'));
	root = await mkdtemp(`${tmpdir()}/shed-attempts-`);
	db = openDb(':memory:');
	ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	const repo = await createRepo(db, root, ada, { name: 'sample' });
	const run = Number(db.query("insert into runs (repo_id, number, workflow, name, title, event, ref, sha) values (?, 1, 'ci.yml', 'CI', 'x', 'push', 'refs/heads/main', 'abc')").run(repo).lastInsertRowid);
	job = Number(db.query("insert into jobs (run_id, job_key, name, payload, status, attempt) values (?, 'test', 'test', '', 'success', 2)").run(run).lastInsertRowid);
	other = Number(db.query("insert into jobs (run_id, job_key, name, payload) values (?, 'lint', 'lint', '')").run(run).lastInsertRowid);
	const first = await task(job, 'failure', 'first try\n');
	const second = await task(job, 'success', 'second try\n');
	await task(other, 'success', 'lint\n');
	db.query('update jobs set task_id = ? where id = ?').run(second, job);
	expect(first).toBeLessThan(second);
});

test('invalid workflow jobs expose diagnostic names and numeric links despite their empty key', async () => {
	const repo = await createRepo(db, root, ada, { name: 'invalid-needs' });
	const content = 'name: Invalid\non: workflow_dispatch\njobs:\n  missing_dependency: { needs: does_not_exist, runs-on: host, steps: [] }\n';
	const sha = await commitFiles(repoDir(root, repo), { branch: 'main', parent: null, changes: [{ path: '.forgejo/workflows/ci.yml', content }], message: 'invalid workflow', author: { name: 'Ada', email: 'ada@x' } });
	await trigger(db, root, repo, { event: 'workflow_dispatch', ref: 'refs/heads/main', sha, userId: ada, title: 'Invalid workflow', payload: {} });
	const base = '/repos/ada/invalid-needs';
	const result = await call(`${base}/actions/runs/1`);
	expect(result.status).toBe(200);
	const run = JSON.parse(result.text);
	const error = "Job 'missing_dependency' depends on unknown job 'does_not_exist'";
	expect(run).toMatchObject({ status: 'failure', title: 'Invalid workflow' });
	expect(run.jobs).toHaveLength(1);
	const diagnostic = run.jobs[0];
	expect(diagnostic).toMatchObject({ job: '', name: error, status: 'failure', needs: [], runs_on: [], step_names: [], task_id: null, steps: [] });
	expect((await call(`${base}/actions/jobs/${diagnostic.id}/logs`))).toEqual({ status: 200, text: '' });
	expect(JSON.parse((await call(`${base}/actions/jobs/${diagnostic.id}/attempts`)).text)).toEqual([]);
	expect(JSON.parse((await call(`${base}/actions/runs`)).text).workflow_runs[0]).toMatchObject({ status: 'failure', html_url: 'http://shed/ada/invalid-needs/actions/runs/1' });
	const [status] = JSON.parse((await call(`${base}/statuses/${sha}`)).text);
	expect(status).toMatchObject({ status: 'failure', context: `Invalid / ${error} (workflow_dispatch)`, description: error, target_url: `/ada/invalid-needs/actions/runs/1/jobs/${diagnostic.id}` });
	const link = await import('../../../routes/[owner]/[repo]/actions/runs/[run]/jobs/[job]/+page.server.js');
	await expect((async () => link.load({ params: { owner: 'ada', repo: 'invalid-needs', run: '1', job: String(diagnostic.id) } } as never))()).rejects.toMatchObject({ status: 303, location: `/ada/invalid-needs/actions/runs/1?job=${diagnostic.id}` });
	for (const suffix of ['/rerun', '/rerun?failed=true']) {
		const res = await call(`${base}/actions/runs/1${suffix}`, 'POST');
		expect(res.status).toBe(409);
		expect(JSON.parse(res.text).message).toBe(error);
	}
	await call(`${base}/actions/runs/1/cancel`, 'POST');
	expect(JSON.parse((await call(`${base}/actions/runs/1`)).text)).toMatchObject({ status: 'failure', run_attempt: 1 });
	expect(db.query('select count(*) as n from tasks where job_id = ?').get(diagnostic.id)).toEqual({ n: 0 });
});
afterAll(() => Promise.all([rm(root, { recursive: true }), rm(scratch, { recursive: true, force: true })]));

test('attempts are listed oldest first, and each has its own log', async () => {
	const list = JSON.parse((await call(`/repos/ada/sample/actions/jobs/${job}/attempts`)).text);
	expect(list.map((a: { attempt: number; status: string }) => [a.attempt, a.status])).toEqual([
		[1, 'failure'],
		[2, 'success']
	]);
	expect((await call(`/repos/ada/sample/actions/jobs/${job}/logs`)).text).toBe('second try');
	expect((await call(`/repos/ada/sample/actions/jobs/${job}/logs?task=${list[0].id}`)).text).toBe('first try');
	// Another job's task isn't one of this job's attempts.
	const lint = db.query<{ id: number }, [number]>('select id from tasks where job_id = ?').get(other)!.id;
	expect((await call(`/repos/ada/sample/actions/jobs/${job}/logs?task=${lint}`)).status).toBe(404);
	expect((await call('/repos/ada/sample/actions/jobs/9999/attempts')).status).toBe(404);
});
