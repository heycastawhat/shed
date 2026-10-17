import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { createKey, revokeKey, updateKey } from '#lib/server/agents.js';
import { api, type User } from '#lib/server/forgejo.js';
import { read } from '#lib/server/store.js';
import { addHost, hostsFor, pair, removeHost, survey } from '#lib/server/t3.js';
import { WRITE_TOOLS, decide } from '#lib/server/tools.js';

export async function load({ locals }) {
	if (!locals.token) redirect(303, '/login');
	const me = await api<User>(locals.token, '/user');
	const d = await read();
	const approvals = d.approvals.filter((a) => a.userId === me.id).reverse();
	return {
		t3: (await survey(await hostsFor(me.id))).map(({ host, snap, error }) => ({
			id: host.id,
			name: host.name,
			url: host.url,
			expiresAt: host.expiresAt ?? null,
			projects: snap?.projects.length ?? 0,
			error
		})),
		writeTools: WRITE_TOOLS,
		keys: d.keys
			.filter((k) => k.userId === me.id)
			.map(({ id, name, repos, ask, createdAt, lastUsedAt }) => ({ id, name, repos, ask: ask ?? [], createdAt, lastUsedAt })),
		pending: approvals.filter((a) => a.status === 'pending'),
		decided: approvals.filter((a) => a.status !== 'pending').slice(0, 10),
		activity: d.activity.filter((a) => a.userId === me.id).slice(-30).reverse()
	};
}

export const actions = {
	create: async ({ locals, request }) => {
		if (!locals.token) redirect(303, '/login');
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Give the agent a name' });
		const me = await api<User>(locals.token, '/user');
		const ask = form.getAll('ask').map(String).filter((t) => WRITE_TOOLS.includes(t));
		const key = await createKey(me, name, repoList(form), ask);
		return { key, name };
	},
	edit: async ({ locals, request }) => {
		if (!locals.token) redirect(303, '/login');
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Give the agent a name' });
		const me = await api<User>(locals.token, '/user');
		await updateKey(me.id, String(form.get('id')), {
			name,
			repos: repoList(form),
			ask: form.getAll('ask').map(String).filter((t) => WRITE_TOOLS.includes(t))
		});
	},
	addHost: async ({ locals, request }) => {
		if (!locals.token) redirect(303, '/login');
		const form = await request.formData();
		const [name, link, url, token] = ['name', 'link', 'url', 'token'].map((k) => String(form.get(k) ?? '').trim());
		if (!/^https?:\/\//.test(link || url) || !(link || token)) return fail(400, { hostError: 'Paste a pairing link, or give the host URL (http://…) and a token' });
		const me = await api<User>(locals.token, '/user');
		try {
			const h = link ? await pair(link) : { url, token, expiresAt: undefined };
			await addHost(me.id, name || new URL(h.url).host, h.url, h.token, h.expiresAt);
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { hostError: e.body.message });
			throw e;
		}
	},
	removeHost: async ({ locals, request }) => {
		if (!locals.token) redirect(303, '/login');
		const me = await api<User>(locals.token, '/user');
		await removeHost(me.id, String((await request.formData()).get('id')));
	},
	revoke: async ({ locals, request }) => {
		if (!locals.token) redirect(303, '/login');
		const me = await api<User>(locals.token, '/user');
		await revokeKey(me.id, String((await request.formData()).get('id')));
	},
	approve: ({ locals, request }) => resolve(locals.token, request, true),
	deny: ({ locals, request }) => resolve(locals.token, request, false)
};

// Empty means every repo.
function repoList(form: FormData) {
	const repos = String(form.get('repos') ?? '')
		.split(/[\s,]+/)
		.filter(Boolean);
	return repos.length ? repos : ['*'];
}

async function resolve(token: string | undefined, request: Request, approve: boolean) {
	if (!token) redirect(303, '/login');
	const me = await api<User>(token, '/user');
	try {
		await decide(me.id, String((await request.formData()).get('id')), approve);
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
}
