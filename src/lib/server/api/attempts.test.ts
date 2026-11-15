import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { logPath } from '../actions/runs.js';
import { openDb } from '../db.js';
import { createRepo } from '../repos.js';

// A re-run job keeps its earlier attempts' tasks and logs.

let root: string, db: Database, ada: number, job: number, other: number;
let dispatch: typeof import('./index.js').dispatch;
const scratch = `${tmpdir()}/shed-attempts-env-${crypto.randomUUID()}`;
mock.module('$app/env/private', () => ({
	FORGE_DATA: scratch,
	FORGE_SECRET: 'x'.repeat(40),
	T3_URL: '',
	T3_TOKEN: '',
	SHED_DATA: scratch,
	SHED_ALLOWED_USERS: 'user:ada',
	SHED_OIDC_ISSUER: 'http://oidc',
	SHED_OIDC_CLIENT_ID: 'x',
	SHED_OIDC_CLIENT_SECRET: 'x',
	SHED_SSH_PORT: '',
	SHED_SSH_URL: '',
	SHED_ACTIONS_URL: '',
	SHED_RUNNER_TOKEN: ''
}));

async function call(path: string) {
	const res = await dispatch(db, root, 'http://shed', new Request(`http://shed/api/v1${path}`), { user: getUser(db, ada)!, token: null });
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
