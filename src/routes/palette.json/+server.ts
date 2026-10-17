import { error, json } from '@sveltejs/kit';
import { api, apiPage, type FoundPull, type Repo } from '#lib/server/forgejo.js';

// What the command palette can jump to besides fixed pages: your repos and your open pull requests.
export async function GET({ locals }) {
	if (!locals.token) error(401, 'Log in first');
	const [repos, pulls] = await Promise.all([
		api<Repo[]>(locals.token, '/user/repos?limit=50'),
		apiPage<FoundPull>(locals.token, '/repos/issues/search?type=pulls&state=open&limit=30').then((p) => p.items)
	]);
	return json({
		repos: repos.map((r) => ({ name: r.full_name, description: r.description })),
		pulls: pulls.map((p) => ({ title: p.title, repo: p.repository.full_name, number: p.number }))
	});
}
