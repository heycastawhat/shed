import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, type Repo, type User } from '#lib/server/forgejo.js';
import { clones, cloneProject, hostFor, hostsFor, launchFromForm, projectFor, retryClone, survey } from '#lib/server/t3.js';
import { taskActions, taskDetail } from '#lib/server/task.js';

export async function load({ locals, parent, url }) {
	const { repo, user } = await parent();
	const hosts = await survey(user ? await hostsFor(user.id) : []);
	if (!hosts.length) error(404, 'Connect T3 Code in Settings → Agents first');
	// A host whose clone of the repo is still running, or failed, shows that instead of running tasks.
	const cloning = (
		await Promise.all(
			hosts.map(async ({ host, snap }) => {
				const p = snap && projectFor(snap, repo.name);
				const c = p && (await clones(host).catch(() => [])).find((c) => c.projectId === p.id && (c.phase === 'running' || c.phase === 'failed'));
				return c ? [{ host: host.id, name: host.name, project: c.projectId, phase: c.phase, percent: c.percent, error: c.error }] : [];
			})
		)
	).flat();
	// Only hosts with this repo as a project can run tasks for it.
	const usable = hosts.flatMap(({ host, snap, models, web }) => {
		const p = snap && projectFor(snap, repo.name);
		if (!p || cloning.some((c) => c.host === host.id)) return [];
		const last = [...snap.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.modelSelection;
		return [
			{
				id: host.id,
				name: host.name,
				models,
				last: last && { model: `${last.instanceId}/${last.model}`, reasoning: last.options?.[0]?.value as string | undefined },
				threads: snap.threads.filter((t) => t.projectId === p.id && !t.deletedAt).map((t) => ({ ...t, host: host.id, hostName: host.name, web: `${web}/${encodeURIComponent(t.id)}` }))
			}
		];
	});
	const threads = usable.flatMap((h) => h.threads).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	const [id, on] = ['thread', 'host'].map((k) => url.searchParams.get(k));
	const thread = id ? threads.find((t) => t.id === id && (!on || t.host === on)) : threads[0];
	const detail = thread ? await taskDetail(locals.token, hosts.find((h) => h.host.id === thread.host)!.host, thread.id, repo.full_name) : null;
	return {
		reachable: hosts.filter((h) => h.snap).map((h) => ({ id: h.host.id, name: h.host.name })),
		hosts: usable.map(({ threads, ...h }) => h),
		cloning,
		down: hosts.filter((h) => h.error).map((h) => ({ name: h.host.name, error: h.error })),
		threads,
		// The projection's thread lacks status and the active run; the shell's copy has them.
		selected: detail && thread && { thread, ...detail }
	};
}

async function host(token: string | undefined, form: FormData) {
	return hostFor((await api<User>(token, '/user')).id, form.get('host'));
}

export const actions = {
	launch: async ({ locals, params, request }) => {
		let to: string;
		try {
			to = await launchFromForm(locals.token, `${params.owner}/${params.repo}`, await request.formData());
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
		redirect(303, to);
	},
	setup: async ({ locals, request, params }) => {
		const form = await request.formData();
		const repo = await api<Repo>(locals.token, `/repos/${params.owner}/${params.repo}`);
		try {
			// Over SSH when Shed serves it: agents push without a password prompt, with the host's key (added in Settings → SSH keys).
			await cloneProject(await host(locals.token, form), repo.name, repo.ssh_url || repo.clone_url);
		} catch (e) {
			if (!isHttpError(e)) throw e;
			const scope = /source-control|scope|forbidden|permission/i.test(e.body.message);
			return fail(e.status, { setupError: scope ? 'This host was connected without permission to clone. Pair it again in Settings → Agents.' : e.body.message });
		}
	},
	retry: async ({ locals, request }) => {
		const form = await request.formData();
		try {
			await retryClone(await host(locals.token, form), String(form.get('project')));
		} catch (e) {
			if (!isHttpError(e)) throw e;
			return fail(e.status, { setupError: e.body.message });
		}
	},
	...taskActions
};
