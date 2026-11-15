import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { request } from '#lib/server/forgejo.js';
import { db } from '#lib/server/shed.js';

// Where a fork can go: your own account or an org you're in.
export async function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	const orgs = db
		.query<{ login: string }, [number]>("select u.login from org_members m join users u on u.id = m.org_id where m.user_id = ? and u.kind = 'org' order by u.login")
		.all(locals.user.id)
		.map((o) => o.login);
	return { owners: [locals.user.login, ...orgs] };
}

export const actions = {
	default: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		const owner = String(form.get('owner') ?? '');
		const name = String(form.get('name') ?? '').trim();
		let full: string;
		try {
			const res = await request(locals.token, `/repos/${params.owner}/${params.repo}/forks`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, organization: owner && owner !== locals.user?.login ? owner : undefined })
			});
			full = (await res.json()).full_name;
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { owner, name, error: e.body.message });
			throw e;
		}
		redirect(303, `/${full}`);
	}
};
