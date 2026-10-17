import { error, redirect } from '@sveltejs/kit';
import { api, type Repo, type User } from '#lib/server/forgejo.js';
import { taskActions, taskDetail } from '#lib/server/task.js';
import { config, hostFor, shell } from '#lib/server/t3.js';

export async function load({ locals, params }) {
	if (!locals.token) redirect(303, '/login');
	const me = await api<User>(locals.token, '/user');
	const host = await hostFor(me.id, params.host);
	const [snap, cfg, repos] = await Promise.all([shell(host), config(host), api<Repo[]>(locals.token, '/user/repos?limit=50')]);
	const t = snap.threads.find((t) => t.id === params.thread && !t.deletedAt);
	if (!t) error(404, 'No such task');
	const project = snap.projects.find((p) => p.id === t.projectId)?.title ?? '';
	const repo = repos.find((r) => r.name === project)?.full_name ?? null;
	return {
		thread: { ...t, host: host.id, hostName: host.name, web: `${cfg.web}/${encodeURIComponent(t.id)}` },
		project,
		repo,
		models: cfg.models,
		...(await taskDetail(locals.token, host, t.id, repo ?? ''))
	};
}

export const actions = taskActions;
