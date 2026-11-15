import type { Database } from 'bun:sqlite';
import { appendFile, mkdir, rm } from 'node:fs/promises';
import YAML from 'yaml';
import { git } from '../git.js';
import { onPush } from '../push.js';
import { repoDir, type RepoRow } from '../repos.js';
import { fires, parseWorkflow, planJobs, workflowFiles, type Trigger } from './workflows.js';

export type RunRow = {
	id: number;
	repo_id: number;
	number: number;
	workflow: string;
	name: string;
	title: string;
	event: string;
	event_payload: string;
	ref: string;
	sha: string;
	user_id: number | null;
	issue_id: number | null;
	status: string;
	attempt: number;
	started_at: string | null;
	stopped_at: string | null;
	created_at: string;
};
export type JobRow = {
	id: number;
	run_id: number;
	job_key: string;
	name: string;
	needs: string;
	runs_on: string;
	payload: string;
	status: string;
	result: string | null;
	outputs: string;
	uses_always: number;
	attempt: number;
	task_id: number | null;
	started_at: string | null;
	stopped_at: string | null;
};

const now = () => new Date().toISOString();
export const DONE = new Set(['success', 'failure', 'cancelled', 'skipped']);
export const logPath = (root: string, taskId: number) => `${root}/actions/logs/${Math.floor(taskId / 1000)}/${taskId}.log`;

// Bumped whenever a job becomes runnable, so idle runners polling with the same version can be answered without a query.
let version = 1;
export const tasksVersion = () => version;

const repoRow = (db: Database, id: number) => db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(id)!;

// Each job reports as a commit status, named like Forgejo's ("<workflow> / <job> (<event>)") so required checks match.
export function statusContext(run: RunRow, job: JobRow) {
	return `${run.name} / ${job.name} (${run.event})`;
}
function setStatus(db: Database, run: RunRow, job: JobRow, state: string, description: string) {
	const repo = repoRow(db, run.repo_id);
	db.query('insert into statuses (repo_id, sha, context, state, description, target_url) values (?, ?, ?, ?, ?, ?)').run(
		run.repo_id,
		run.sha,
		statusContext(run, job),
		state,
		description,
		`/${repo.owner}/${repo.name}/actions/runs/${run.number}/jobs/${job.id}`
	);
	for (const fn of statusListeners) fn(db, run.repo_id, run.sha);
}
const statusListeners: ((db: Database, repoId: number, sha: string) => void)[] = [];
// Auto-merge hears about CI statuses here (they're written without an API request).
export const onCiStatus = (fn: (db: Database, repoId: number, sha: string) => void) => statusListeners.push(fn);

async function changedFiles(dir: string, from: string | null, to: string) {
	const args = from && !/^0+$/.test(from) ? ['diff', '--name-only', from, to] : ['show', '--format=', '--name-only', to];
	return (await git(dir, args).catch(() => '')).split('\n').filter(Boolean);
}

export async function trigger(
	db: Database,
	root: string,
	repoId: number,
	t: Trigger & { sha: string; before?: string | null; userId: number | null; title: string; payload: Record<string, unknown>; issueId?: number; only?: string }
) {
	const dir = repoDir(root, repoId);
	const files = await workflowFiles(dir, t.sha);
	const changed = t.event === 'push' || t.event.startsWith('pull_request') ? (t.files ?? (await changedFiles(dir, t.before ?? null, t.sha))) : undefined;
	const made: number[] = [];
	for (const f of files) {
		if (t.only && f.path !== t.only && !f.path.endsWith(`/${t.only}`)) continue;
		let w;
		try {
			w = parseWorkflow(f.text);
		} catch (e) {
			console.error('workflow', f.path, e);
			continue;
		}
		if (!fires(w.on, { ...t, files: changed })) continue;
		const jobs = planJobs(w);
		if (!jobs.length) continue;
		const id = db.transaction(() => {
			const number = db.query<{ n: number }, [number]>('update repos set next_run = next_run + 1 where id = ? returning next_run - 1 as n').get(repoId)!.n;
			const runId = Number(
				db
					.query('insert into runs (repo_id, number, workflow, name, title, event, event_payload, ref, sha, user_id, issue_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
					.run(repoId, number, f.path.split('/').pop()!, String(w.name ?? f.path.split('/').pop()), t.title, t.event, JSON.stringify(t.payload), t.ref ?? '', t.sha, t.userId, t.issueId ?? null)
					.lastInsertRowid
			);
			for (const j of jobs)
				db.query('insert into jobs (run_id, job_key, name, needs, runs_on, payload, status, uses_always) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
					runId,
					j.key,
					j.name,
					JSON.stringify(j.needs),
					JSON.stringify(j.runsOn),
					j.payload,
					j.needs.length ? 'blocked' : 'waiting',
					+j.always
				);
			return runId;
		})();
		const run = db.query<RunRow, [number]>('select * from runs where id = ?').get(id)!;
		for (const j of db.query<JobRow, [number]>('select * from jobs where run_id = ?').all(id)) setStatus(db, run, j, 'pending', 'Waiting to run');
		made.push(id);
		version++;
	}
	return made;
}

// After a job finishes: unblock the jobs that needed it (or skip them, if it failed and they don't run on failure), and settle the run.
export function settle(db: Database, runId: number) {
	const run = db.query<RunRow, [number]>('select * from runs where id = ?').get(runId)!;
	for (;;) {
		const jobs = db.query<JobRow, [number]>('select * from jobs where run_id = ?').all(runId);
		const byKey = new Map<string, JobRow[]>();
		for (const j of jobs) byKey.set(j.job_key, [...(byKey.get(j.job_key) ?? []), j]);
		let changed = false;
		for (const j of jobs.filter((j) => j.status === 'blocked')) {
			const needs: JobRow[] = (JSON.parse(j.needs) as string[]).flatMap((k) => byKey.get(k) ?? []);
			if (!needs.every((n) => DONE.has(n.status))) continue;
			const ok = needs.every((n) => n.status === 'success' || (n.status === 'skipped' && n.result === 'skipped'));
			if (ok || j.uses_always) {
				db.query("update jobs set status = 'waiting' where id = ?").run(j.id);
				version++;
			} else {
				db.query("update jobs set status = 'skipped', result = 'skipped', stopped_at = ? where id = ?").run(now(), j.id);
				setStatus(db, run, j, 'success', 'Skipped');
			}
			changed = true;
		}
		if (!changed) break;
	}
	const jobs = db.query<JobRow, [number]>('select * from jobs where run_id = ?').all(runId);
	const started = jobs.some((j) => j.status !== 'waiting' && j.status !== 'blocked');
	if (started && !run.started_at) db.query('update runs set started_at = ? where id = ?').run(now(), runId);
	if (jobs.every((j) => DONE.has(j.status))) {
		const status = jobs.some((j) => j.status === 'failure') ? 'failure' : jobs.some((j) => j.status === 'cancelled') ? 'cancelled' : 'success';
		db.query('update runs set status = ?, stopped_at = ? where id = ?').run(status, now(), runId);
	} else db.query('update runs set status = ? where id = ?').run(jobs.some((j) => j.status === 'running') ? 'running' : 'waiting', runId);
}

export function finishJob(db: Database, jobId: number, result: 'success' | 'failure' | 'cancelled' | 'skipped') {
	const job = db.query<JobRow, [number]>('select * from jobs where id = ?').get(jobId)!;
	if (DONE.has(job.status)) return;
	db.query('update jobs set status = ?, result = ?, stopped_at = ? where id = ?').run(result, result, now(), jobId);
	if (job.task_id) db.query('update tasks set status = ?, stopped_at = ? where id = ?').run(result, now(), job.task_id);
	const run = db.query<RunRow, [number]>('select * from runs where id = ?').get(job.run_id)!;
	setStatus(db, run, job, result === 'success' || result === 'skipped' ? 'success' : result === 'cancelled' ? 'error' : 'failure', { success: 'Successful', failure: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped' }[result]);
	settle(db, job.run_id);
}

export function cancelRun(db: Database, runId: number) {
	for (const j of db.query<JobRow, [number]>("select * from jobs where run_id = ? and status in ('waiting', 'blocked')").all(runId)) finishJob(db, j.id, 'cancelled');
	// Running tasks learn on their next update that they've been cancelled, and report back.
	db.query("update tasks set status = 'cancelling' where status = 'running' and job_id in (select id from jobs where run_id = ?)").run(runId);
}

// Re-run every job of a run (or only the failed ones) as a new attempt on the same commit.
export function rerun(db: Database, runId: number, failedOnly = false) {
	const run = db.query<RunRow, [number]>('select * from runs where id = ?').get(runId)!;
	if (!DONE.has(run.status)) throw new Error('This run is still going');
	const jobs = db.query<JobRow, [number]>('select * from jobs where run_id = ?').all(runId);
	const again = new Set(jobs.filter((j) => !failedOnly || j.status === 'failure' || j.status === 'cancelled' || j.status === 'skipped').map((j) => j.job_key));
	// Jobs downstream of a re-run job run again too.
	for (let grew = true; grew; ) {
		grew = false;
		for (const j of jobs) if (!again.has(j.job_key) && (JSON.parse(j.needs) as string[]).some((n) => again.has(n))) again.add(j.job_key), (grew = true);
	}
	db.transaction(() => {
		db.query("update runs set status = 'waiting', attempt = attempt + 1, stopped_at = null where id = ?").run(runId);
		for (const j of jobs.filter((j) => again.has(j.job_key)))
			db
				.query('update jobs set status = ?, result = null, outputs = ?, task_id = null, started_at = null, stopped_at = null, attempt = attempt + 1 where id = ?')
				.run((JSON.parse(j.needs) as string[]).some((n) => again.has(n)) ? 'blocked' : 'waiting', '{}', j.id);
	})();
	for (const j of db.query<JobRow, [number]>("select * from jobs where run_id = ? and status in ('waiting', 'blocked')").all(runId)) setStatus(db, run, j, 'pending', 'Waiting to run');
	version++;
	settle(db, runId);
}

export async function appendLog(root: string, taskId: number, rows: { time: string; content: string }[]) {
	const path = logPath(root, taskId);
	await mkdir(path.replace(/\/[^/]+$/, ''), { recursive: true });
	await appendFile(path, rows.map((r) => `${r.time} ${r.content.replace(/\n/g, ' ')}\n`).join(''));
}

// --- events ---

function repoPayload(repo: RepoRow, origin: string) {
	const full = `${repo.owner}/${repo.name}`;
	return { id: repo.id, name: repo.name, full_name: full, owner: { login: repo.owner, username: repo.owner }, private: !!repo.private, default_branch: repo.default_branch, html_url: `${origin}/${full}`, clone_url: `${origin}/${full}.git` };
}

onPush(async ({ db, root, repo, userId, updates }) => {
	const { origin } = await import('../shed.js').catch(() => ({ origin: () => '' }));
	const actor = db.query<{ login: string }, [number]>('select login from users where id = ?').get(userId)?.login ?? '';
	for (const u of updates) {
		if (!u.after) continue;
		const dir = repoDir(root, repo.id);
		const subject = (await git(dir, ['log', '-1', '--format=%s', u.after]).catch(() => '')).trim();
		await trigger(db, root, repo.id, {
			event: 'push',
			ref: u.ref,
			sha: u.after,
			before: u.before,
			userId,
			title: subject,
			payload: { ref: u.ref, before: u.before ?? '0'.repeat(40), after: u.after, repository: repoPayload(repo, origin()), pusher: { login: actor, username: actor }, sender: { login: actor, username: actor }, head_commit: { id: u.after, message: subject } }
		});
	}
});

type PullEvent = { id: number; number: number; title: string; body: string; head: string; head_sha: string; base: string; merge_base: string | null; user_id: number; state: string; merged_at?: string | null };
const pullListeners: ((db: Database, origin: string, repo: RepoRow, p: PullEvent, action: string, userId: number) => void)[] = [];
// Webhooks hear about pull requests here.
export const onPullEvent = (fn: (typeof pullListeners)[number]) => pullListeners.push(fn);

// pull_request events: opened, synchronize (new commits), reopened, closed, edited.
export async function pullEvent(
	db: Database,
	root: string,
	origin: string,
	repo: RepoRow,
	p: PullEvent,
	action: string,
	userId: number
) {
	for (const fn of pullListeners) {
		try {
			fn(db, origin, repo, p, action, userId);
		} catch (e) {
			console.error('pull listener', e);
		}
	}
	const dir = repoDir(root, repo.id);
	const baseSha = (await git(dir, ['rev-parse', `refs/heads/${p.base}`]).catch(() => '')).trim();
	const author = db.query<{ login: string }, [number]>('select login from users where id = ?').get(p.user_id)?.login ?? '';
	const actor = db.query<{ login: string }, [number]>('select login from users where id = ?').get(userId)?.login ?? '';
	const files = p.merge_base ? await changedFiles(dir, p.merge_base, p.head_sha) : undefined;
	const pr = {
		number: p.number,
		title: p.title,
		body: p.body,
		state: p.state,
		merged: !!p.merged_at,
		user: { login: author },
		head: { ref: p.head, sha: p.head_sha, repo: repoPayload(repo, origin) },
		base: { ref: p.base, sha: baseSha, repo: repoPayload(repo, origin) },
		html_url: `${origin}/${repo.owner}/${repo.name}/pulls/${p.number}`
	};
	// A closed or merged PR's unfinished runs have nothing left to check.
	if (action === 'closed')
		for (const r of db.query<{ id: number }, [number]>("select id from runs where issue_id = ? and status in ('waiting', 'running')").all(p.id)) cancelRun(db, r.id);
	for (const event of ['pull_request', 'pull_request_target'] as const)
		await trigger(db, root, repo.id, {
			event,
			action,
			base: p.base,
			files,
			// pull_request runs the PR's code from its head; pull_request_target runs the base branch's workflows and code.
			ref: event === 'pull_request' ? `refs/pull/${p.number}/head` : `refs/heads/${p.base}`,
			sha: event === 'pull_request' ? p.head_sha : baseSha,
			userId,
			title: p.title,
			issueId: p.id,
			payload: { action, number: p.number, pull_request: pr, repository: repoPayload(repo, origin), sender: { login: actor, username: actor } }
		});
}

export function dispatchPayload(inputs: Record<string, string>, repo: RepoRow, origin: string, ref: string, actor: string) {
	return { inputs, ref, repository: repoPayload(repo, origin), sender: { login: actor, username: actor }, workflow: '' };
}

// The workflow file as the runner gets it, for the run page's "workflow" view.
export const jobYaml = (j: JobRow) => YAML.parse(j.payload);

// Scheduled workflows: once a minute, each repo's default branch is checked for `on: schedule` crons that match (UTC).
const schedules = new Map<number, { sha: string; crons: { workflow: string; match: (d: Date) => boolean }[] }>();
export async function tickSchedules(db: Database, root: string, now = new Date()) {
	const { parseCron } = await import('./cron.js');
	for (const repo of db.query<RepoRow, []>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.archived = 0').all()) {
		const dir = repoDir(root, repo.id);
		const sha = (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${repo.default_branch}`]).catch(() => '')).trim();
		if (!sha) continue;
		let entry = schedules.get(repo.id);
		if (entry?.sha !== sha) {
			const crons: { workflow: string; match: (d: Date) => boolean }[] = [];
			for (const f of await workflowFiles(dir, sha)) {
				try {
					const on = parseWorkflow(f.text).on as Record<string, unknown> | undefined;
					const list = on && typeof on === 'object' && !Array.isArray(on) ? (on.schedule as { cron?: string }[] | undefined) : undefined;
					for (const s of list ?? []) if (s?.cron) crons.push({ workflow: f.path, match: parseCron(s.cron) });
				} catch (e) {
					console.error('schedule', repo.name, f.path, (e as Error).message);
				}
			}
			schedules.set(repo.id, (entry = { sha, crons }));
		}
		const due = new Set(entry.crons.filter((c) => c.match(now)).map((c) => c.workflow));
		for (const workflow of due)
			await trigger(db, root, repo.id, {
				event: 'schedule',
				ref: `refs/heads/${repo.default_branch}`,
				sha,
				userId: null,
				title: `Scheduled run`,
				payload: { schedule: '', repository: { full_name: `${repo.owner}/${repo.name}` } },
				only: workflow
			});
	}
}

export function startScheduler(db: Database, root: string) {
	const g = globalThis as { shedCron?: boolean };
	if (g.shedCron) return;
	g.shedCron = true;
	const tick = () => {
		const now = new Date();
		now.setUTCSeconds(0, 0);
		tickSchedules(db, root, now).catch((e) => console.error('schedule', e));
		void Promise.all([import('../mirror.js'), import('../store.js')]).then(([m, crypt]) => m.syncDueMirrors(db, root, crypt)).catch((e) => console.error('mirror', e));
		// Hourly: expired artifacts go (their rows stay, marked expired, so run pages still list them).
		if (now.getUTCMinutes() === 0)
			for (const a of db.query<{ id: number }, []>("select id from artifacts where expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') and status = 'done'").all()) {
				void rm(`${root}/actions/artifacts/${a.id}`, { recursive: true, force: true });
				db.query("update artifacts set status = 'expired' where id = ?").run(a.id);
			}
		setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
	};
	setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
}
