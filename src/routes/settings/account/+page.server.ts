import { FORGEJO_URL } from '$app/env/private';
import { endSessions, listSessions } from '#lib/server/auth.js';
import { api, type User } from '#lib/server/forgejo.js';

export async function load({ locals, cookies }) {
	const me = await api<User>(locals.token, '/user');
	return { me, forgejo: FORGEJO_URL, sessions: await listSessions(cookies, me.id) };
}

export const actions = {
	end: async ({ locals, cookies, request }) => {
		const me = await api<User>(locals.token, '/user');
		await endSessions(cookies, me.id, String((await request.formData()).get('id')));
	},
	endOthers: async ({ locals, cookies }) => {
		const me = await api<User>(locals.token, '/user');
		await endSessions(cookies, me.id);
	}
};
