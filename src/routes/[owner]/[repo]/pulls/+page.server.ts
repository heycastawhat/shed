import { api, type Label, type Pull } from '#lib/server/forgejo.js';

export async function load({ locals, params, url }) {
	const repo = `/repos/${params.owner}/${params.repo}`;
	const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
	const label = url.searchParams.get('labels');
	const labels = await api<Label[]>(locals.token, `${repo}/labels?limit=100`);
	// Unlike the issues list, the pulls list filters by label id, not name.
	const id = label && labels.find((l) => l.name === label)?.id;
	const pulls = label && !id ? [] : await api<Pull[]>(locals.token, `${repo}/pulls?state=${state}&sort=recentupdate&limit=50${id ? `&labels=${id}` : ''}`);
	return { pulls, state, label, labels };
}
