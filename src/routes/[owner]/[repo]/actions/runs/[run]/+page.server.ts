import { fail, isHttpError } from '@sveltejs/kit';
import { api, request } from '#lib/server/forgejo.js';

type Step = { id: number; result: string | null; started_at: string | null; stopped_at: string | null; log_index: number; log_length: number };
type Job = { id: number; name: string; step_names: string[]; status: string; needs: string[]; runs_on: string[]; started_at: string | null; completed_at: string | null; runner: string | null; steps: Step[]; attempt: number };
type Run = { id: number; index_in_repo: number; title: string; name: string; workflow_id: string; event: string; status: string; run_attempt: number; commit_sha: string; prettyref: string; trigger_user: { login: string } | null; created: string; started: string; stopped: string; jobs: Job[] };

// ANSI colour codes from tools' output; the page shows plain text.
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

export async function load({ locals, params, url }) {
	const base = `/repos/${params.owner}/${params.repo}/actions`;
	const run = await api<Run>(locals.token, `${base}/runs/${params.run}`);
	const job = run.jobs.find((j) => String(j.id) === url.searchParams.get('job')) ?? run.jobs.find((j) => j.status === 'failure') ?? run.jobs[0];
	const raw = job ? await (await request(locals.token, `${base}/jobs/${job.id}/logs`)).text() : '';
	// Each line is "<time> <text>"; steps say which lines are theirs, the rest is set-up and tear-down.
	const lines = raw ? raw.split('\n').map((l) => ({ time: l.slice(0, 24), text: strip(l.slice(25)) })) : [];
	const used = new Set<number>();
	const steps = (job?.steps ?? []).map((s) => {
		for (let i = s.log_index; i < s.log_index + s.log_length; i++) used.add(i);
		return { ...s, name: job!.step_names[s.id] ?? `Step ${s.id + 1}`, lines: lines.slice(s.log_index, s.log_index + s.log_length) };
	});
	const setup = lines.filter((_, i) => !used.has(i) && i < (steps[0]?.log_index ?? lines.length));
	const teardown = lines.filter((_, i) => !used.has(i) && i >= (steps[0]?.log_index ?? lines.length));
	const { artifacts } = await api<{ artifacts: { name: string; size: number; expired: boolean; archive_download_url: string }[] }>(locals.token, `${base}/runs/${params.run}/artifacts`);
	return { run, job, steps, setup, teardown, artifacts };
}

async function act(token: string | undefined, path: string, method = 'POST') {
	try {
		await request(token, path, { method });
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
}

export const actions = {
	rerun: ({ locals, params }) => act(locals.token, `/repos/${params.owner}/${params.repo}/actions/runs/${params.run}/rerun`),
	rerunFailed: ({ locals, params }) => act(locals.token, `/repos/${params.owner}/${params.repo}/actions/runs/${params.run}/rerun?failed=true`),
	cancel: ({ locals, params }) => act(locals.token, `/repos/${params.owner}/${params.repo}/actions/runs/${params.run}/cancel`)
};
