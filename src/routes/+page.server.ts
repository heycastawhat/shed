import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, request, type Repo, type User } from '#lib/server/forgejo.js';
import { needsYou, openPush, recentPush } from '#lib/server/home.js';
import { update } from '#lib/server/store.js';
import { decide } from '#lib/server/tools.js';

export async function load({ locals }) {
	if (!locals.token) return { needs: [], push: null, repos: [] };
	const me = await api<User>(locals.token, '/user');
	// These come from several API calls; a failure in one shouldn't blank the whole page.
	const [needs, push, repos] = await Promise.all([
		needsYou(locals.token, me).catch(() => []),
		recentPush(locals.token, me).catch(() => null),
		api<Repo[]>(locals.token, '/user/repos?limit=50').catch(() => [])
	]);
	return { needs, push, repos: repos.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6) };
}

async function act(token: string | undefined, run: (me: User, token: string) => Promise<unknown>) {
	if (!token) redirect(303, '/login');
	try {
		await run(await api<User>(token, '/user'), token);
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
}

const field = async (request: Request, name: string) => String((await request.formData()).get(name) ?? '');

export const actions = {
	approve: ({ locals, request: req }) =>
		act(locals.token, async (_, token) => {
			const form = await req.formData();
			await request(token, `/repos/${form.get('repo')}/pulls/${form.get('number')}/reviews`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ event: 'APPROVED', body: '' })
			});
		}),
	allow: ({ locals, request: req }) => act(locals.token, async (me) => decide(me.id, await field(req, 'id'), true)),
	deny: ({ locals, request: req }) => act(locals.token, async (me) => decide(me.id, await field(req, 'id'), false)),
	snooze: ({ locals, request: req }) =>
		act(locals.token, async (me) => {
			const key = await field(req, 'key');
			await update((d) => ((d.snoozed[me.id] ??= {})[key] = new Date(Date.now() + 24 * 3600_000).toISOString()));
		}),
	read: ({ locals, request: req }) =>
		act(locals.token, async (_, token) => {
			await request(token, `/notifications/threads/${await field(req, 'id')}?to-status=read`, { method: 'PATCH' });
		}),
	dismiss: ({ locals, request: req }) =>
		act(locals.token, async (me) => {
			const id = `push:${await field(req, 'id')}`;
			await update((d) => (d.dismissed[me.id] = [...(d.dismissed[me.id] ?? []), id]));
		}),
	open: async ({ locals, request: req }) => {
		let to: string | undefined;
		const result = await act(locals.token, async (_, token) => {
			const form = await req.formData();
			const repo = String(form.get('repo'));
			to = `/${repo}/pulls/${await openPush(token, repo, String(form.get('branch')))}`;
		});
		if (result) return result;
		redirect(303, to!);
	}
};
