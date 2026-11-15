import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { request } from '#lib/server/forgejo.js';

export function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
}

export const actions = {
	default: async ({ locals, request: req }) => {
		const f = await req.formData();
		const values = { username: String(f.get('username') ?? '').trim(), full_name: String(f.get('full_name') ?? '').trim(), description: String(f.get('description') ?? '').trim() };
		let login: string;
		try {
			const res = await request(locals.token, '/orgs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
			login = ((await res.json()) as { username: string }).username;
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message, values });
			throw e;
		}
		redirect(303, `/${login}`);
	}
};
