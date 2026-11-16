import { error } from '@sveltejs/kit';
import { api, type Repo, type User } from './forgejo.js';
import { read, update } from './store.js';
import { dispatch, hostFor, hostsFor, launchFromForm, projection, survey, type Host } from './t3.js';
import { decide } from './tools.js';

// The Agents page's data and actions, shared by the page and the API the Android app uses (/api/v1/user/agents).
export async function agentsOverview(token: string) {
	const [me, repos, d] = await Promise.all([api<User>(token, '/user'), api<Repo[]>(token, '/user/repos?limit=50'), read()]);
	const hosts = await hostsFor(me.id);
	return {
		t3: hosts.length ? await tasks(hosts, repos, new Set(d.dismissed[me.id] ?? [])) : null,
		pending: d.approvals.filter((a) => a.userId === me.id && a.status === 'pending').reverse(),
		activity: d.activity.filter((a) => a.userId === me.id).slice(-8).reverse(),
		keys: d.keys.filter((k) => k.userId === me.id).map(({ id, name, repos, lastUsedAt }) => ({ id, name, repos, lastUsedAt }))
	};
}

// Every T3 task on every host, tagged with the forge repo whose name matches its project's title.
// A dismissed task is keyed with its last update, so new activity brings it back.
export const taskKey = (t: { host: string; id: string; updatedAt: string }) => `task:${t.host}:${t.id}:${t.updatedAt}`;

async function tasks(hosts: Host[], repos: Repo[], dismissed: Set<string>) {
	const all = await survey(hosts);
	const threads = all
		.flatMap(({ host, snap, models, web }) =>
			(snap?.threads ?? [])
				.filter((t) => !t.deletedAt)
				.map((t) => {
					const project = snap!.projects.find((p) => p.id === t.projectId)?.title ?? '?';
					return {
						...t,
						host: host.id,
						hostName: host.name,
						web: `${web}/${encodeURIComponent(t.id)}`,
						project,
						repo: repos.find((r) => r.name === project)?.full_name ?? null,
						model: models.find((m) => m.slug === t.modelSelection.model)?.name ?? t.modelSelection.model
					};
				})
		)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	// The shell only says a request is pending; what it asks for is in the thread's turn items.
	const asks = await Promise.all(
		threads
			.filter((t) => t.pendingRuntimeRequest)
			.map(async (t) => {
				const p = await projection(hosts.find((h) => h.id === t.host)!, t.id);
				const items = p.visibleTurnItems.map((i) => i.item);
				const item = items.findLast((i) => i.type === 'approval_request' && i.status !== 'completed');
				const asked = items.find((i) => i.type === 'user_input_request' && i.requestId === t.pendingRuntimeRequest!.id);
				return { thread: t, request: t.pendingRuntimeRequest!, prompt: item?.prompt ?? null, questions: asked?.questions?.map((q) => q.question) ?? null };
			})
	);
	// Repos a new task can run in: those with a same-named project on at least one host.
	const targets = repos
		.map((r) => ({
			repo: r.full_name,
			base: r.default_branch,
			hosts: all.flatMap(({ host, snap, models }) => {
				if (!snap?.projects.some((p) => p.title === r.name)) return [];
				const last = [...snap.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.modelSelection;
				return [{ id: host.id, name: host.name, models, last: last && { model: `${last.instanceId}/${last.model}`, reasoning: last.options?.[0]?.value as string | undefined } }];
			})
		}))
		.filter((t) => t.hosts.length);
	return {
		targets,
		threads: threads.filter((t) => t.activeRunId || t.pendingRuntimeRequest || !dismissed.has(taskKey(t))).slice(0, 20),
		asks,
		multi: hosts.length > 1,
		down: all.filter((h) => h.error).map((h) => ({ name: h.host.name, error: h.error }))
	};
}

export async function dismissTask(userId: number, host: string, thread: string, updatedAt: string) {
	const key = taskKey({ host, id: thread, updatedAt });
	await update((d) => (d.dismissed[userId] = [...(d.dismissed[userId] ?? []), key]));
}

export async function respondToTask(userId: number, host: unknown, thread: unknown, request: unknown, decision: unknown) {
	await dispatch(await hostFor(userId, host), { type: 'runtime-request.respond', threadId: thread, requestId: request, decision });
}

export { decide, launchFromForm };
export const requireText = (s: unknown, what: string) => (typeof s === 'string' && s ? s : error(400, `Missing ${what}`));
