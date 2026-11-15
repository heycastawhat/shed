import { fail } from '@sveltejs/kit';
import { api, type User } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';

type Collaborator = User & { permissions: { admin: boolean; push: boolean } };

export async function load({ locals, params }) {
	const list = await api<Collaborator[]>(locals.token, `/repos/${params.owner}/${params.repo}/collaborators`);
	return {
		collaborators: list.map((u) => ({ login: u.login, name: u.full_name, avatar: u.avatar_url, permission: u.permissions.admin ? 'admin' : u.permissions.push ? 'write' : 'read' }))
	};
}

const path = (p: { owner: string; repo: string }, login: string) => `/repos/${p.owner}/${p.repo}/collaborators/${encodeURIComponent(login)}`;

export const actions = {
	set: async ({ locals, params, request }) => {
		const f = await request.formData();
		const login = String(f.get('login') ?? '')
			.trim()
			.replace(/^@/, '');
		if (!login) return fail(422, { action: 'set', error: 'Type a login' });
		if (login.toLowerCase() === params.owner.toLowerCase()) return fail(422, { action: 'set', error: `${login} owns this repo already` });
		return (await send('set', locals.token, path(params, login), 'PUT', { permission: String(f.get('permission')) })) ?? { action: 'set', added: login };
	},
	remove: async ({ locals, params, request }) => send('remove', locals.token, path(params, String((await request.formData()).get('login'))), 'DELETE')
};
