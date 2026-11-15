import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { createToken, SCOPES, type Scope } from '#lib/server/accounts.js';
import { db } from '#lib/server/shed.js';

type Row = { id: number; name: string; scopes: string; repos: string; expires_at: string | null; last_used_at: string | null; created_at: string };

export function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	const tokens = db
		.query<Row, [number]>('select id, name, scopes, repos, expires_at, last_used_at, created_at from tokens where user_id = ? order by created_at desc')
		.all(locals.user.id)
		.map((t) => ({ ...t, scopes: JSON.parse(t.scopes) as string[], repos: JSON.parse(t.repos) as string[] }));
	return { tokens, scopes: SCOPES, login: locals.user.login };
}

export const actions = {
	create: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const scopes = form.getAll('scope').map(String) as Scope[];
		const repos = String(form.get('repos') ?? '').split(/[\s,]+/).filter(Boolean);
		const days = Number(form.get('days'));
		try {
			const token = createToken(db, locals.user.id, {
				name: String(form.get('name') ?? ''),
				scopes,
				repos: repos.length ? repos : ['*'],
				expiresAt: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : undefined
			});
			return { token };
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
	},
	revoke: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		db.query('delete from tokens where id = ? and user_id = ?').run(Number((await request.formData()).get('id')), locals.user.id);
	}
};
