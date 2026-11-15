import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, request } from '#lib/server/forgejo.js';
import { db } from '#lib/server/shed.js';

type Runner = { id: number; name: string; labels: string[]; version: string; scope: string; last_online: string | null; online: boolean };

export async function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	if (!locals.user.admin) error(403, 'Only admins can see this page');
	const users = db
		.query<{ id: number; login: string; name: string; kind: string; admin: number; oidc_sub: string | null; created_at: string }, []>(
			"select id, login, name, kind, admin, oidc_sub, created_at from users where kind != 'agent' order by kind, login"
		)
		.all();
	const counts = db.query<{ repos: number; runs: number; size: number }, []>('select (select count(*) from repos) as repos, (select count(*) from runs) as runs, 0 as size').get()!;
	return { runners: await api<Runner[]>(locals.token, '/admin/runners'), users, counts };
}

export const actions = {
	token: async ({ locals }) => {
		try {
			return { token: (await api<{ token: string }>(locals.token, '/admin/runners/registration-token')).token };
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
	},
	removeRunner: async ({ locals, request: req }) => {
		await request(locals.token, `/admin/runners/${Number((await req.formData()).get('id'))}`, { method: 'DELETE' });
	},
	admin: async ({ locals, request: req }) => {
		if (!locals.user?.admin) error(403, 'Admins only');
		const form = await req.formData();
		const id = Number(form.get('id'));
		if (id === locals.user.id) return fail(400, { error: "You can't change your own admin rights" });
		db.query('update users set admin = ? where id = ?').run(form.has('on') ? 1 : 0, id);
	}
};
