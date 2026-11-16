import { error } from '@sveltejs/kit';
import { internalToken } from './internal.js';
import { me, route } from './router.js';

// The Agents page over the API, for the Android app: approvals waiting on you, recent agent activity, keys, and T3 tasks.
// The agent modules read Kit's env (store, T3), so they load on first use rather than with the router.
const view = () => import('../agentsview.js');

route('GET', '/user/agents', async (c) => (await view()).agentsOverview(internalToken(me(c).id)));
route('POST', '/user/agents/approvals/:id', async (c) => {
	const b = await c.body<{ approve?: boolean }>();
	if (typeof b.approve !== 'boolean') error(400, 'Send approve: true or false');
	await (await view()).decide(me(c).id, c.params.id, b.approve);
});
route('POST', '/user/agents/tasks/dismiss', async (c) => {
	const v = await view();
	const b = await c.body<{ host?: string; thread?: string; updatedAt?: string }>();
	await v.dismissTask(me(c).id, v.requireText(b.host, 'host'), v.requireText(b.thread, 'thread'), v.requireText(b.updatedAt, 'updatedAt'));
});
route('POST', '/user/agents/tasks/respond', async (c) => {
	const b = await c.body<{ host?: string; thread?: string; request?: string; decision?: string }>();
	await (await view()).respondToTask(me(c).id, b.host, b.thread, b.request, b.decision);
});
// Starts a task: the same fields as the web's New task form (repo, text, host, model, reasoning, reasoningId, mode, base, …).
route('POST', '/user/agents/tasks', async (c) => {
	const v = await view();
	const b = await c.body<Record<string, string>>();
	const form = new FormData();
	for (const [k, x] of Object.entries(b)) if (typeof x === 'string') form.set(k, x);
	return { to: await v.launchFromForm(internalToken(me(c).id), v.requireText(b.repo, 'repo'), form) };
});
