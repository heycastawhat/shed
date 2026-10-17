import { api, type Repo, type User } from '#lib/server/forgejo.js';

type Owner = User & { description: string; website: string; location: string; created: string };

export async function load({ locals, params }) {
	const [owner, repos, members] = await Promise.all([
		api<Owner>(locals.token, `/users/${params.owner}`),
		api<Repo[]>(locals.token, `/users/${params.owner}/repos?limit=50`),
		// Only orgs have members; a user 404s here.
		api<User[]>(locals.token, `/orgs/${params.owner}/members?limit=50`).catch(() => null)
	]);
	repos.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	return { owner, repos, members };
}
