import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, request, type Repo, type User } from '#lib/server/forgejo.js';

type Org = { username?: string; name?: string };

export async function load({ locals }) {
	if (!locals.token) redirect(303, '/login');
	const [me, orgs, gitignores, licenses] = await Promise.all([
		api<User>(locals.token, '/user'),
		api<Org[]>(locals.token, '/user/orgs'),
		api<string[]>(locals.token, '/gitignore/templates'),
		api<{ key: string; name: string }[]>(locals.token, '/licenses')
	]);
	return { owners: [me.login, ...orgs.map((o) => o.username ?? o.name ?? '').filter(Boolean)], gitignores, licenses };
}

export const actions = {
	default: async ({ locals, request: req }) => {
		if (!locals.token) redirect(303, '/login');
		const form = await req.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();
		const values = { owner: get('owner'), name: get('name'), description: get('description'), visibility: get('visibility'), readme: form.has('readme'), gitignore: get('gitignore'), license: get('license'), branch: get('branch') || 'main' };
		const bad = (error: string) => fail(400, { error, values });

		if (!/^[\w.-]+$/.test(values.name) || /^\.+$/.test(values.name) || values.name.length > 100) return bad('Use letters, numbers, dots, dashes and underscores for the name');
		if (!/^[\w./-]+$/.test(values.branch)) return bad('That is not a valid branch name');
		try {
			const me = await api<User>(locals.token, '/user');
			if (values.owner !== me.login && !/^[\w.-]+$/.test(values.owner)) return bad('Pick an owner');
			const body = {
				name: values.name,
				description: values.description,
				private: values.visibility !== 'public',
				// Forgejo only creates the first commit (and branch) when asked to initialise.
				auto_init: values.readme || !!values.gitignore || !!values.license,
				readme: 'Default',
				gitignores: values.gitignore,
				license: values.license,
				default_branch: values.branch
			};
			const res = await request(locals.token, values.owner === me.login ? '/user/repos' : `/orgs/${values.owner}/repos`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			redirect(303, `/${((await res.json()) as Repo).full_name}`);
		} catch (e) {
			if (isHttpError(e)) return bad(e.body.message);
			throw e;
		}
	}
};
