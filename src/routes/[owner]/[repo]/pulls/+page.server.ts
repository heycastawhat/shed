import { api, type Pull } from '#lib/server/forgejo.js';

export async function load({ locals, params, url }) {
	const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
	const pulls = await api<Pull[]>(locals.token, `/repos/${params.owner}/${params.repo}/pulls?state=${state}&sort=recentupdate&limit=50`);
	return { pulls, state };
}
