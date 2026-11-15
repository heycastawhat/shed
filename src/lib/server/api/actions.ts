import { error } from '@sveltejs/kit';
import YAML from 'yaml';
import { readLog } from '../actions/rpc.js';
import { cancelRun, dispatchPayload, rerun, trigger, type JobRow, type RunRow } from '../actions/runs.js';
import { workflowFiles } from '../actions/workflows.js';
import { encrypt } from '../store.js';
import { refSha, repoOf, userJson, type RepoCtx } from './common.js';
import { me, page, route, type Ctx } from './router.js';

function stepNames(payload: string, key: string) {
	try {
		const steps = (YAML.parse(payload).jobs?.[key]?.steps ?? []) as { name?: string; run?: string; uses?: string }[];
		return steps.map((s) => s.name ?? (s.run ? `Run ${s.run.trim().split('\n')[0]}` : s.uses ? `Run ${s.uses}` : 'Step'));
	} catch {
		return [];
	}
}

type TaskRow = { id: number; steps: string; log_length: number; started_at: string; stopped_at: string | null; runner_id: number | null };

const runJson = (c: Ctx, r: RepoCtx, x: RunRow) => ({
	id: x.id,
	index_in_repo: x.number,
	title: x.title,
	workflow_id: x.workflow,
	name: x.name,
	event: x.event,
	status: x.status,
	run_attempt: x.attempt,
	commit_sha: x.sha,
	ref: x.ref,
	prettyref: x.ref.replace(/^refs\/(heads|tags)\//, '').replace(/^refs\/pull\/(\d+)\/head$/, '#$1'),
	trigger_user: userJson(c.db, x.user_id),
	created: x.created_at,
	started: x.started_at ?? '1970-01-01T00:00:00Z',
	stopped: x.stopped_at ?? '1970-01-01T00:00:00Z',
	html_url: `${c.origin}/${r.full}/actions/runs/${x.number}`
});
function jobJson(c: Ctx, j: JobRow) {
	const t = j.task_id ? c.db.query<TaskRow, [number]>('select * from tasks where id = ?').get(j.task_id) : null;
	return {
		id: j.id,
		name: j.name,
		job: j.job_key,
		status: j.status,
		result: j.result,
		needs: JSON.parse(j.needs),
		runs_on: JSON.parse(j.runs_on),
		attempt: j.attempt,
		started_at: j.started_at,
		completed_at: j.stopped_at,
		task_id: j.task_id,
		runner: t?.runner_id ? (c.db.query<{ name: string }, [number]>('select name from runners where id = ?').get(t.runner_id)?.name ?? null) : null,
		steps: t ? JSON.parse(t.steps) : [],
		// What each step is called in the workflow: its name, else its command or action.
		step_names: stepNames(j.payload, j.job_key),
		log_length: t?.log_length ?? 0
	};
}

const runOf = (c: Ctx, r: RepoCtx, by: 'id' | 'number' = 'id') =>
	c.db.query<RunRow, [number, number]>(`select * from runs where repo_id = ? and ${by} = ?`).get(r.row.id, Number(c.params.run)) ?? error(404, 'Run not found');

route('GET', '/repos/:owner/:repo/actions/runs', (c) => {
	const r = repoOf(c);
	const p = page(c, 25);
	const q = c.url.searchParams;
	const where = ['repo_id = ?'];
	const args: (string | number)[] = [r.row.id];
	for (const [k, col] of [['status', 'status'], ['event', 'event'], ['workflow', 'workflow'], ['head_sha', 'sha']] as const) if (q.get(k)) where.push(`${col} = ?`), args.push(q.get(k)!);
	const total = c.db.query<{ n: number }, (string | number)[]>(`select count(*) as n from runs where ${where.join(' and ')}`).get(...args)!.n;
	const rows = c.db.query<RunRow, (string | number)[]>(`select * from runs where ${where.join(' and ')} order by id desc limit ? offset ?`).all(...args, p.limit, p.offset);
	return { workflow_runs: rows.map((x) => runJson(c, r, x)), total_count: total };
});
// Runs are addressed by their number in the repo (as on the run page); /runs/id/:id takes the global id.
route('GET', '/repos/:owner/:repo/actions/runs/:run', (c) => {
	const r = repoOf(c);
	const x = runOf(c, r, 'number');
	return { ...runJson(c, r, x), jobs: c.db.query<JobRow, [number]>('select * from jobs where run_id = ? order by id').all(x.id).map((j) => jobJson(c, j)) };
});
route('POST', '/repos/:owner/:repo/actions/runs/:run/rerun', (c) => {
	const r = repoOf(c, 'write');
	const x = runOf(c, r, 'number');
	try {
		rerun(c.db, x.id, c.url.searchParams.get('failed') === 'true');
	} catch (e) {
		error(409, (e as Error).message);
	}
	return runJson(c, r, c.db.query<RunRow, [number]>('select * from runs where id = ?').get(x.id)!);
});
route('POST', '/repos/:owner/:repo/actions/runs/:run/cancel', (c) => {
	const r = repoOf(c, 'write');
	cancelRun(c.db, runOf(c, r, 'number').id);
});
route('DELETE', '/repos/:owner/:repo/actions/runs/:run', (c) => {
	const r = repoOf(c, 'admin');
	const x = runOf(c, r, 'number');
	if (!['success', 'failure', 'cancelled', 'skipped'].includes(x.status)) error(409, 'Cancel the run first');
	c.db.query('delete from runs where id = ?').run(x.id);
});
route('GET', '/repos/:owner/:repo/actions/jobs/:job/logs', async (c) => {
	const r = repoOf(c);
	const j = c.db.query<JobRow, [number, number]>('select j.* from jobs j join runs r on r.id = j.run_id where j.id = ? and r.repo_id = ?').get(Number(c.params.job), r.row.id) ?? error(404, 'Job not found');
	const lines = j.task_id ? await readLog(c.root, j.task_id) : [];
	const from = Number(c.url.searchParams.get('from') ?? 0);
	return new Response(lines.slice(from).join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-log-length': String(lines.length) } });
});

// Workflows that can be started by hand (they have `workflow_dispatch:`), and starting one.
route('GET', '/repos/:owner/:repo/actions/workflows', async (c) => {
	const r = repoOf(c);
	const sha = await refSha(r.dir, r.row.default_branch);
	const files = sha ? await workflowFiles(r.dir, sha) : [];
	const { parseWorkflow } = await import('../actions/workflows.js');
	return {
		workflows: files.map((f) => {
			let w: Record<string, unknown> = {};
			try {
				w = parseWorkflow(f.text);
			} catch {}
			const on = w.on as Record<string, { inputs?: Record<string, unknown> }> | string | string[] | undefined;
			const dispatch = typeof on === 'string' ? on === 'workflow_dispatch' : Array.isArray(on) ? on.includes('workflow_dispatch') : !!on && 'workflow_dispatch' in on;
			return { id: f.path.split('/').pop(), name: w.name ?? f.path.split('/').pop(), path: f.path, dispatch, inputs: (on && typeof on === 'object' && !Array.isArray(on) && on.workflow_dispatch?.inputs) || {} };
		})
	};
});
route('POST', '/repos/:owner/:repo/actions/workflows/:file/dispatches', async (c) => {
	const r = repoOf(c, 'write');
	const u = me(c);
	const b = await c.body<{ ref?: string; inputs?: Record<string, string> }>();
	const ref = b.ref || r.row.default_branch;
	const full = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
	const sha = (await refSha(r.dir, full)) ?? error(404, `Can't find ${ref}`);
	const made = await trigger(c.db, c.root, r.row.id, {
		event: 'workflow_dispatch',
		ref: full,
		sha,
		userId: u.id,
		title: `Manually run by ${u.login}`,
		payload: dispatchPayload(b.inputs ?? {}, r.row, c.origin, full, u.login),
		only: c.params.file
	});
	if (!made.length) error(422, `${c.params.file} doesn't run on workflow_dispatch`);
});

// --- secrets and variables ---

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const checkName = (n: string) => {
	if (!NAME.test(n) || /^(GITHUB|GITEA|FORGEJO)_/i.test(n)) error(422, 'Names use letters, digits and _, and can’t start with GITHUB_, GITEA_ or FORGEJO_');
	return n.toUpperCase();
};
route('GET', '/repos/:owner/:repo/actions/secrets', (c) =>
	c.db.query<{ name: string; created_at: string }, [number]>('select name, created_at from action_secrets where repo_id = ? order by name').all(repoOf(c, 'admin').row.id)
);
route('PUT', '/repos/:owner/:repo/actions/secrets/:name', async (c) => {
	const r = repoOf(c, 'admin');
	const v = (await c.body<{ data: string }>()).data ?? '';
	c.db.query('insert into action_secrets (repo_id, name, value) values (?, ?, ?) on conflict do update set value = excluded.value').run(r.row.id, checkName(c.params.name), await encrypt(v));
});
route('DELETE', '/repos/:owner/:repo/actions/secrets/:name', (c) => {
	c.db.query('delete from action_secrets where repo_id = ? and name = ?').run(repoOf(c, 'admin').row.id, c.params.name.toUpperCase());
});
route('GET', '/repos/:owner/:repo/actions/variables', (c) =>
	c.db.query<{ name: string; value: string }, [number]>('select name, value as data from action_vars where repo_id = ? order by name').all(repoOf(c, 'admin').row.id)
);
for (const m of ['POST', 'PUT'])
	route(m, '/repos/:owner/:repo/actions/variables/:name', async (c) => {
		const r = repoOf(c, 'admin');
		const v = (await c.body<{ value: string }>()).value ?? '';
		c.db.query('insert into action_vars (repo_id, name, value) values (?, ?, ?) on conflict do update set value = excluded.value').run(r.row.id, checkName(c.params.name), v);
	});
route('DELETE', '/repos/:owner/:repo/actions/variables/:name', (c) => {
	c.db.query('delete from action_vars where repo_id = ? and name = ?').run(repoOf(c, 'admin').row.id, c.params.name.toUpperCase());
});

// --- runners ---

const newToken = () => crypto.getRandomValues(new Uint8Array(24)).toBase64({ alphabet: 'base64url', omitPadding: true });
route('GET', '/repos/:owner/:repo/actions/runners/registration-token', (c) => {
	const r = repoOf(c, 'admin');
	const token = newToken();
	c.db.query('insert into runner_tokens (token, repo_id) values (?, ?)').run(token, r.row.id);
	return { token };
});
route('GET', '/admin/runners/registration-token', (c) => {
	if (!me(c).admin) error(403, 'Only admins can register runners for every repo');
	const token = newToken();
	c.db.query('insert into runner_tokens (token, repo_id) values (?, null)').run(token);
	return { token };
});
type RunnerRow = { id: number; name: string; labels: string; version: string; repo_id: number | null; last_online: string | null; created_at: string };
const runnerJson = (x: RunnerRow) => ({
	id: x.id,
	name: x.name,
	labels: JSON.parse(x.labels),
	version: x.version,
	scope: x.repo_id ? 'repo' : 'global',
	last_online: x.last_online,
	// Runners poll every few seconds; quiet for a minute means it's gone.
	online: !!x.last_online && Date.now() - Date.parse(x.last_online) < 60_000
});
route('GET', '/repos/:owner/:repo/actions/runners', (c) => {
	const r = repoOf(c, 'admin');
	return c.db.query<RunnerRow, [number]>('select * from runners where repo_id = ? or repo_id is null order by name').all(r.row.id).map(runnerJson);
});
route('GET', '/admin/runners', (c) => {
	if (!me(c).admin) error(403, 'Admins only');
	return c.db.query<RunnerRow, []>('select * from runners order by name').all().map(runnerJson);
});
route('DELETE', '/admin/runners/:id', (c) => {
	if (!me(c).admin) error(403, 'Admins only');
	c.db.query('delete from runners where id = ?').run(Number(c.params.id));
});
route('DELETE', '/repos/:owner/:repo/actions/runners/:id', (c) => {
	c.db.query('delete from runners where id = ? and repo_id = ?').run(Number(c.params.id), repoOf(c, 'admin').row.id);
});
