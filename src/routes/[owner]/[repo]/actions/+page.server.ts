import { fail, isHttpError } from '@sveltejs/kit';
import { api, request, type User } from '#lib/server/forgejo.js';

type Run = {
	id: number;
	index_in_repo: number;
	title: string;
	workflow_id: string;
	prettyref: string;
	commit_sha: string;
	event: string;
	status: string;
	trigger_user: User | null;
	started: string;
	stopped: string;
	created: string;
	html_url: string;
};

const SIZE = 25;

export async function load({ locals, params, url }) {
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const { workflow_runs: items, total_count: total } = await api<{ workflow_runs: Run[]; total_count: number }>(
		locals.token,
		`/repos/${params.owner}/${params.repo}/actions/runs?limit=${SIZE}&page=${page}`
	).catch(() => ({ workflow_runs: [], total_count: 0 }));
	// The list carries each run's full event payload; keep only what the page shows.
	const runs = items.map((r) => ({
		id: r.id,
		number: r.index_in_repo,
		title: r.title,
		workflow: r.workflow_id,
		ref: r.prettyref,
		sha: r.commit_sha,
		event: r.event,
		status: r.status,
		who: r.trigger_user?.login ?? null,
		// Unset times come back as the Unix epoch.
		duration: Date.parse(r.started) > 0 && Date.parse(r.stopped) > 0 ? (Date.parse(r.stopped) - Date.parse(r.started)) / 1000 : null,
		created: r.created,
		url: r.html_url
	}));
	const { workflows } = await api<{ workflows: { id: string; name: string; dispatch: boolean; inputs: Record<string, unknown> }[] }>(locals.token, `/repos/${params.owner}/${params.repo}/actions/workflows`).catch(() => ({ workflows: [] }));
	return { runs, page, total, size: SIZE, dispatchable: workflows.filter((w) => w.dispatch) };
}

export const actions = {
	dispatch: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		const inputs = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith('input:')).map(([k, v]) => [k.slice(6), String(v)]));
		try {
			await request(locals.token, `/repos/${params.owner}/${params.repo}/actions/workflows/${encodeURIComponent(String(form.get('workflow')))}/dispatches`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ref: form.get('ref'), inputs })
			});
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
	}
};
