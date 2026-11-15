import { fail, redirect } from '@sveltejs/kit';
import { endSessions, listSessions } from '#lib/server/accounts.js';
import { AVATAR_MAX } from '#lib/server/avatars.js';
import { api } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';
import { mailEnabled } from '#lib/server/mail.js';
import { db, provider } from '#lib/server/shed.js';

type Settings = { full_name: string; description: string; website: string; location: string };

export async function load({ locals, cookies }) {
	if (!locals.user) redirect(303, '/login');
	return {
		me: locals.user,
		profile: await api<Settings>(locals.token, '/user/settings'),
		uploaded: locals.user.avatar_url.startsWith('/avatars/'),
		provider: provider.issuer,
		mail: mailEnabled(),
		notifyEmail: !!db.query<{ n: number }, [number]>('select notify_email as n from users where id = ?').get(locals.user.id)?.n,
		sessions: listSessions(db, locals.user.id, cookies.get('shed_session'))
	};
}

export const actions = {
	profile: async ({ locals, request }) => {
		const f = await request.formData();
		const body = Object.fromEntries(['full_name', 'description', 'website', 'location'].map((k) => [k, String(f.get(k) ?? '')]));
		return (await send('profile', locals.token, '/user/settings', 'PATCH', body)) ?? { action: 'profile', saved: true };
	},
	avatar: async ({ locals, request }) => {
		const file = (await request.formData()).get('avatar');
		if (!(file instanceof File) || !file.size) return fail(422, { action: 'avatar', error: 'Choose an image' });
		if (file.size > AVATAR_MAX) return fail(413, { action: 'avatar', error: 'Avatars can be up to 1 MB' });
		return send('avatar', locals.token, '/user/avatar', 'POST', { image: new Uint8Array(await file.arrayBuffer()).toBase64() });
	},
	emails: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		db.query('update users set notify_email = ? where id = ?').run((await request.formData()).has('on') ? 1 : 0, locals.user.id);
	},
	removeAvatar: ({ locals }) => send('avatar', locals.token, '/user/avatar', 'DELETE'),
	end: async ({ locals, cookies, request }) => {
		if (!locals.user) redirect(303, '/login');
		endSessions(db, locals.user.id, cookies.get('shed_session'), String((await request.formData()).get('id')));
	},
	endOthers: ({ locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');
		endSessions(db, locals.user.id, cookies.get('shed_session'));
	}
};
