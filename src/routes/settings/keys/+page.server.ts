import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, request } from '#lib/server/forgejo.js';
import { getSshBase } from '#lib/server/shedrepo-shape.js';

type Key = { id: number; title: string; fingerprint: string; created_at: string; last_used_at: string | null };

export async function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	return { keys: await api<Key[]>(locals.token, '/user/keys'), ssh: getSshBase() };
}

const send = async (token: string | undefined, path: string, init: RequestInit) => {
	try {
		await request(token, path, init);
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
};

export const actions = {
	add: async ({ locals, request: req }) => {
		const form = await req.formData();
		return send(locals.token, '/user/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: form.get('title'), key: form.get('key') }) });
	},
	remove: async ({ locals, request: req }) => send(locals.token, `/user/keys/${Number((await req.formData()).get('id'))}`, { method: 'DELETE' })
};
