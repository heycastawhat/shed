import { error, fail, redirect } from '@sveltejs/kit';
import { AVATAR_MAX } from '#lib/server/avatars.js';
import { api, apiPage, type User } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';

type Org = User & { username: string; description: string; website: string; location: string };

export async function load({ locals, params }) {
	if (!locals.user) redirect(303, '/login');
	const org = await api<Org>(locals.token, `/orgs/${params.org}`);
	const members = await api<(User & { role: 'owner' | 'member' })[]>(locals.token, `/orgs/${org.username}/members`);
	if (!locals.user.admin && !members.some((m) => m.id === locals.user!.id && m.role === 'owner')) error(403, `Only owners of ${org.username} can change its settings`);
	return { org, members, repos: (await apiPage(locals.token, `/orgs/${org.username}/repos?limit=1`)).total };
}

const path = (org: string, rest = '') => `/orgs/${encodeURIComponent(org)}${rest}`;
const login = async (request: Request) => {
	const f = await request.formData();
	return { f, user: encodeURIComponent(String(f.get('login') ?? '').trim()) };
};

export const actions = {
	profile: async ({ locals, params, request }) => {
		const f = await request.formData();
		const body = Object.fromEntries(['full_name', 'description', 'website', 'location'].map((k) => [k, String(f.get(k) ?? '')]));
		return (await send('profile', locals.token, path(params.org), 'PATCH', body)) ?? { action: 'profile', saved: true };
	},
	avatar: async ({ locals, params, request }) => {
		const file = (await request.formData()).get('avatar');
		if (!(file instanceof File) || !file.size) return fail(422, { action: 'avatar', error: 'Choose an image' });
		if (file.size > AVATAR_MAX) return fail(413, { action: 'avatar', error: 'Avatars can be up to 1 MB' });
		return send('avatar', locals.token, path(params.org, '/avatar'), 'POST', { image: new Uint8Array(await file.arrayBuffer()).toBase64() });
	},
	removeAvatar: ({ locals, params }) => send('avatar', locals.token, path(params.org, '/avatar'), 'DELETE'),
	member: async ({ locals, params, request }) => {
		const { f, user } = await login(request);
		if (!user) return fail(422, { action: 'member', error: 'Type a login' });
		return send('member', locals.token, path(params.org, `/members/${user}`), 'PUT', { role: f.get('role') === 'owner' ? 'owner' : 'member' });
	},
	remove: async ({ locals, params, request }) => {
		const { user } = await login(request);
		const failed = await send('member', locals.token, path(params.org, `/members/${user}`), 'DELETE');
		if (failed) return failed;
		// Someone who removed themselves may not be allowed back on this page.
		if (decodeURIComponent(user).toLowerCase() === locals.user?.login.toLowerCase()) redirect(303, `/${params.org}`);
	},
	delete: async ({ locals, params, request }) => {
		if (String((await request.formData()).get('confirm') ?? '').trim().toLowerCase() !== params.org.toLowerCase()) return fail(422, { action: 'delete', error: `Type ${params.org} to confirm` });
		const failed = await send('delete', locals.token, path(params.org), 'DELETE');
		if (failed) return failed;
		redirect(303, '/repos');
	}
};
