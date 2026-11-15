import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { request, type Repo } from '#lib/server/forgejo.js';
import { db } from '#lib/server/shed.js';

export function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	const orgs = db
		.query<{ login: string }, [number]>("select u.login from users u join org_members m on m.org_id = u.id where m.user_id = ? and u.kind = 'org' order by u.login")
		.all(locals.user.id)
		.map((o) => o.login);
	return { owners: [locals.user.login, ...orgs] };
}

export const actions = {
	default: async ({ locals, request: req }) => {
		const form = await req.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();
		const values = { url: get('url'), owner: get('owner'), name: get('name'), description: get('description'), visibility: get('visibility'), mirror: form.has('mirror'), username: get('username'), interval: get('interval') };
		let repo: Repo;
		try {
			const res = await request(locals.token, '/repos/migrate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					clone_addr: values.url,
					repo_owner: values.owner,
					repo_name: values.name || values.url.replace(/\/+$/, '').split('/').pop()?.replace(/\.git$/, ''),
					description: values.description,
					private: values.visibility !== 'public',
					mirror: values.mirror,
					mirror_interval: Number(values.interval) || 480,
					auth_username: values.username || undefined,
					auth_token: get('token') || undefined
				})
			});
			repo = await res.json();
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message, values });
			throw e;
		}
		redirect(303, `/${repo.full_name}`);
	}
};
