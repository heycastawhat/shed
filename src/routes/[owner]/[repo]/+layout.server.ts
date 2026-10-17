import { redirect } from '@sveltejs/kit';
import { api, apiPage, type Branch, type Repo } from '#lib/server/forgejo.js';
import { hostsFor } from '#lib/server/t3.js';

export async function load({ locals, params, parent }) {
	if (!locals.token) redirect(303, '/login');
	const name = `${params.owner}/${params.repo}`;
	const [repo, branches, tags, { user }] = await Promise.all([
		api<Repo>(locals.token, `/repos/${name}`),
		api<Branch[]>(locals.token, `/repos/${name}/branches?limit=100`),
		apiPage(locals.token, `/repos/${name}/tags?limit=1`).then((p) => p.total, () => 0),
		parent()
	]);
	return { repo, branches: branches.map((b) => b.name), tags, ref: params.ref ?? repo.default_branch, agents: !!user && (await hostsFor(user.id)).length > 0 };
}
