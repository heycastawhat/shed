import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { runtimeToken } from './artifacts.js';
import { RESULT, RESULT_NAME, toStruct, type } from './proto.js';
import { appendLog, finishJob, logPath, settle, tasksVersion, type JobRow, type RunRow } from './runs.js';

// The runner side of CI: forgejo-runner speaks Connect RPC (protobuf over HTTP POST) to <instance>/api/actions/<service>/<method>.
// Register with a registration token, then every call carries x-runner-uuid and x-runner-token.

const hash = (s: string) => new Bun.CryptoHasher('sha256').update(s).digest('hex');
const secret = (prefix: string) => `${prefix}${crypto.getRandomValues(new Uint8Array(24)).toBase64({ alphabet: 'base64url', omitPadding: true })}`;
const now = () => new Date().toISOString();
const ts = (iso: string | null | undefined) => (iso ? { seconds: Math.floor(Date.parse(iso) / 1000), nanos: 0 } : undefined);
const iso = (t: { seconds?: number | string; nanos?: number } | null | undefined) => (t && Number(t.seconds) ? new Date(Number(t.seconds) * 1000 + (t.nanos ?? 0) / 1e6).toISOString() : null);

class RpcError extends Error {
	constructor(
		readonly code: 'unauthenticated' | 'permission_denied' | 'not_found' | 'invalid_argument' | 'internal' | 'unimplemented',
		message: string
	) {
		super(message);
	}
}
const STATUS = { unauthenticated: 401, permission_denied: 403, not_found: 404, invalid_argument: 400, internal: 500, unimplemented: 404 };

type RunnerRow = { id: number; uuid: string; token_hash: string; name: string; labels: string; version: string; repo_id: number | null; ephemeral: number };
export type Ctx = { db: Database; root: string; origin: string; secrets: (repoId: number) => Promise<Record<string, string>>; defaultActionsUrl: string; registrationToken?: string; signingKey: string };

function runnerJson(r: RunnerRow, token = '') {
	return { id: r.id, uuid: r.uuid, token, name: r.name, status: 1, version: r.version, labels: JSON.parse(r.labels), ephemeral: !!r.ephemeral };
}
function authed(c: Ctx, headers: Headers) {
	const uuid = headers.get('x-runner-uuid') ?? '';
	const r = c.db.query<RunnerRow, [string]>('select * from runners where uuid = ?').get(uuid);
	if (!r || r.token_hash !== hash(headers.get('x-runner-token') ?? '')) throw new RpcError('unauthenticated', 'Unknown runner; register it again');
	c.db.query('update runners set last_online = ? where id = ?').run(now(), r.id);
	return r;
}
// A label is "name" or "name:scheme:arg"; jobs match on the name.
const labelNames = (labels: string[]) => labels.map((l) => l.split(':')[0]);

async function pickTask(c: Ctx, runner: RunnerRow) {
	// Tasks whose runner went quiet for 10 minutes are failed so their runs don't hang forever.
	for (const t of c.db.query<{ id: number; job_id: number }, []>("select id, job_id from tasks where status in ('running', 'cancelling') and updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')").all())
		finishJob(c.db, t.job_id, 'failure');
	const have = new Set(labelNames(JSON.parse(runner.labels)));
	const waiting = c.db
		.query<JobRow & { repo_id: number }, []>("select j.*, r.repo_id from jobs j join runs r on r.id = j.run_id where j.status = 'waiting' order by j.id")
		.all()
		.filter((j) => (runner.repo_id === null || runner.repo_id === j.repo_id) && (JSON.parse(j.runs_on) as string[]).every((l) => !l || have.has(l)));
	for (const job of waiting) {
		const token = secret('shedt_');
		// Claim it atomically: only one runner wins a job.
		const taskId = c.db.transaction(() => {
			if (c.db.query<{ n: number }, [number]>("select count(*) as n from jobs where id = ? and status = 'waiting'").get(job.id)!.n === 0) return null;
			const id = Number(c.db.query('insert into tasks (job_id, runner_id, token_hash) values (?, ?, ?)').run(job.id, runner.id, hash(token)).lastInsertRowid);
			c.db.query("update jobs set status = 'running', task_id = ?, started_at = ? where id = ?").run(id, now(), job.id);
			return id;
		})();
		if (!taskId) continue;
		settle(c.db, job.run_id);
		const run = c.db.query<RunRow, [number]>('select * from runs where id = ?').get(job.run_id)!;
		const repo = c.db.query<{ name: string; owner: string }, [number]>('select r.name, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(run.repo_id)!;
		const actor = run.user_id ? (c.db.query<{ login: string }, [number]>('select login from users where id = ?').get(run.user_id)?.login ?? '') : '';
		const event = JSON.parse(run.event_payload);
		const pr = event.pull_request;
		const context = {
			event,
			event_name: run.event,
			ref: run.ref,
			sha: run.sha,
			ref_name: run.ref.replace(/^refs\/(heads|tags)\//, ''),
			ref_type: run.ref.startsWith('refs/tags/') ? 'tag' : 'branch',
			head_ref: pr?.head?.ref ?? '',
			base_ref: pr?.base?.ref ?? '',
			repository: `${repo.owner}/${repo.name}`,
			repository_owner: repo.owner,
			actor,
			triggering_actor: actor,
			run_id: String(run.id),
			run_number: String(run.number),
			run_attempt: String(run.attempt),
			workflow: run.name,
			workflow_ref: `${repo.owner}/${repo.name}/.forgejo/workflows/${run.workflow}@${run.ref}`,
			job: job.job_key,
			token,
			// What upload/download-artifact authenticate with; carries this run and job.
			runtime_token: runtimeToken(c.signingKey, run.id, job.id, taskId),
			gitea_runtime_token: runtimeToken(c.signingKey, run.id, job.id, taskId),
			forgejo_runtime_token: runtimeToken(c.signingKey, run.id, job.id, taskId),
			server_url: c.origin,
			api_url: `${c.origin}/api/v1`,
			retention_days: '90',
			default_actions_url: c.defaultActionsUrl,
			gitea_default_actions_url: c.defaultActionsUrl,
			forgejo_default_actions_url: c.defaultActionsUrl
		};
		const needs: Record<string, { outputs: Record<string, string>; result: number }> = {};
		for (const k of JSON.parse(job.needs) as string[])
			for (const n of c.db.query<JobRow, [number, string]>('select * from jobs where run_id = ? and job_key = ?').all(run.id, k))
				needs[k] = { outputs: { ...needs[k]?.outputs, ...JSON.parse(n.outputs) }, result: RESULT[(n.result ?? 'unspecified') as keyof typeof RESULT] ?? 0 };
		const vars = Object.fromEntries(c.db.query<{ name: string; value: string }, [number]>('select name, value from action_vars where repo_id = ?').all(run.repo_id).map((v) => [v.name, v.value]));
		return {
			id: taskId,
			workflow_payload: new TextEncoder().encode(job.payload),
			context: toStruct(context),
			secrets: { ...(await c.secrets(run.repo_id)), GITHUB_TOKEN: token, GITEA_TOKEN: token, FORGEJO_TOKEN: token },
			needs,
			vars
		};
	}
	return null;
}

const handlers: Record<string, [string, string, (c: Ctx, msg: Record<string, any>, headers: Headers) => Promise<Record<string, unknown>> | Record<string, unknown>]> = {
	'ping.v1.PingService/Ping': ['PingRequest', 'PingResponse', (_c, m) => ({ data: `Hello, ${m.data ?? ''}!` })],
	'runner.v1.RunnerService/Register': [
		'RegisterRequest',
		'RegisterResponse',
		(c, m) => {
			const env = c.registrationToken;
			const t = c.db.query<{ id: number; repo_id: number | null }, [string]>('select id, repo_id from runner_tokens where token = ?').get(String(m.token ?? ''));
			if (!t && !(env && m.token === env)) throw new RpcError('permission_denied', 'That registration token is unknown');
			const uuid = crypto.randomUUID();
			const token = secret('');
			const labels = [...(m.labels ?? []), ...(m.agent_labels ?? []), ...(m.custom_labels ?? [])];
			const id = Number(
				c.db
					.query('insert into runners (uuid, token_hash, name, labels, version, repo_id, ephemeral, last_online) values (?, ?, ?, ?, ?, ?, ?, ?)')
					.run(uuid, hash(token), String(m.name || 'runner'), JSON.stringify(labels), String(m.version ?? ''), t?.repo_id ?? null, m.ephemeral ? 1 : 0, now()).lastInsertRowid
			);
			return { runner: runnerJson(c.db.query<RunnerRow, [number]>('select * from runners where id = ?').get(id)!, token) };
		}
	],
	'runner.v1.RunnerService/Declare': [
		'DeclareRequest',
		'DeclareResponse',
		(c, m, h) => {
			const r = authed(c, h);
			c.db.query('update runners set labels = ?, version = ? where id = ?').run(JSON.stringify(m.labels ?? []), String(m.version ?? ''), r.id);
			return { runner: runnerJson({ ...r, labels: JSON.stringify(m.labels ?? []), version: String(m.version ?? '') }) };
		}
	],
	'runner.v1.RunnerService/FetchTask': [
		'FetchTaskRequest',
		'FetchTaskResponse',
		async (c, _m, h) => {
			const r = authed(c, h);
			const task = await pickTask(c, r);
			return { tasks_version: tasksVersion(), ...(task && { task }) };
		}
	],
	'runner.v1.RunnerService/FetchSingleTask': [
		'FetchSingleTaskRequest',
		'FetchSingleTaskResponse',
		async (c, _m, h) => {
			const r = authed(c, h);
			const task = await pickTask(c, r);
			return { tasks_version: tasksVersion(), ...(task && { task }) };
		}
	],
	'runner.v1.RunnerService/UpdateTask': [
		'UpdateTaskRequest',
		'UpdateTaskResponse',
		(c, m, h) => {
			const r = authed(c, h);
			const s = m.state ?? {};
			const t = c.db.query<{ id: number; job_id: number; status: string; runner_id: number }, [number]>('select id, job_id, status, runner_id from tasks where id = ?').get(Number(s.id));
			if (!t || t.runner_id !== r.id) throw new RpcError('not_found', 'Unknown task');
			const job = c.db.query<JobRow, [number]>('select * from jobs where id = ?').get(t.job_id)!;
			const outputs = { ...JSON.parse(job.outputs), ...(m.outputs ?? {}) };
			c.db.query('update jobs set outputs = ? where id = ?').run(JSON.stringify(outputs), job.id);
			const steps = (s.steps ?? []).map((x: Record<string, any>) => ({
				id: Number(x.id ?? 0),
				result: RESULT_NAME[Number(x.result ?? 0)] || null,
				started_at: iso(x.started_at),
				stopped_at: iso(x.stopped_at),
				log_index: Number(x.log_index ?? 0),
				log_length: Number(x.log_length ?? 0)
			}));
			c.db.query('update tasks set steps = ?, updated_at = ? where id = ?').run(JSON.stringify(steps), now(), t.id);
			const result = Number(s.result ?? 0);
			if (result) finishJob(c.db, job.id, RESULT_NAME[result] as 'success' | 'failure' | 'cancelled' | 'skipped');
			// A cancelled run tells the runner by answering with a cancelled result.
			const state = c.db.query<{ status: string }, [number]>('select status from tasks where id = ?').get(t.id)!.status;
			return { state: { id: t.id, result: state === 'cancelling' ? RESULT.cancelled : result }, sent_outputs: Object.keys(outputs) };
		}
	],
	'runner.v1.RunnerService/UpdateLog': [
		'UpdateLogRequest',
		'UpdateLogResponse',
		async (c, m, h) => {
			const r = authed(c, h);
			const t = c.db.query<{ id: number; runner_id: number; log_length: number }, [number]>('select id, runner_id, log_length from tasks where id = ?').get(Number(m.task_id));
			if (!t || t.runner_id !== r.id) throw new RpcError('not_found', 'Unknown task');
			const index = Number(m.index ?? 0);
			if (index > t.log_length) throw new RpcError('invalid_argument', `Expected log index ${t.log_length}, got ${index}`);
			// Rows already stored (a retry) are skipped.
			const rows = ((m.rows ?? []) as { time?: { seconds?: number }; content?: string }[]).slice(t.log_length - index);
			if (rows.length) {
				await appendLog(c.root, t.id, rows.map((x) => ({ time: iso(x.time) ?? now(), content: x.content ?? '' })));
				c.db.query('update tasks set log_length = log_length + ?, updated_at = ? where id = ?').run(rows.length, now(), t.id);
			}
			return { ack_index: t.log_length + rows.length };
		}
	],
	'runner.v1.RunnerService/UpdateStepSummary': ['UpdateStepSummaryRequest', 'UpdateStepSummaryResponse', (c, _m, h) => (authed(c, h), {})]
};

export async function runnerRpc(c: Ctx, request: Request, path: string) {
	const handler = handlers[path];
	const json = /json/.test(request.headers.get('content-type') ?? '');
	const fail = (e: RpcError) => new Response(JSON.stringify({ code: e.code, message: e.message }), { status: STATUS[e.code], headers: { 'content-type': 'application/json' } });
	if (!handler || request.method !== 'POST') return fail(new RpcError('unimplemented', `No RPC ${path}`));
	const [reqType, resType, fn] = handler;
	try {
		const In = type(reqType), Out = type(resType);
		const body = new Uint8Array(await request.arrayBuffer());
		const msg = json ? In.toObject(In.fromObject(JSON.parse(new TextDecoder().decode(body) || '{}')), { longs: Number, defaults: false }) : In.toObject(In.decode(body), { longs: Number, enums: Number, defaults: false });
		const out = Out.fromObject(await fn(c, msg, request.headers));
		return json
			? new Response(JSON.stringify(Out.toObject(out, { longs: Number, bytes: String })), { headers: { 'content-type': 'application/json' } })
			: new Response(Out.encode(out).finish() as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'application/proto' } });
	} catch (e) {
		if (e instanceof RpcError) return fail(e);
		console.error('runner rpc', path, e);
		return fail(new RpcError('internal', 'Internal error'));
	}
}

// For the run page: a task's log lines, by step.
export async function readLog(root: string, taskId: number) {
	const path = logPath(root, taskId);
	return existsSync(path) ? (await Bun.file(path).text()).split('\n').filter(Boolean) : [];
}
export { ts };
