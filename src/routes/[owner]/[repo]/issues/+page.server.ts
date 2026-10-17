import { api, type Issue, type Label } from '#lib/server/forgejo.js';

export async function load({ locals, params, url }) {
	const repo = `/repos/${params.owner}/${params.repo}`;
	const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
	const label = url.searchParams.get('labels');
	const [issues, labels] = await Promise.all([
		api<Issue[]>(locals.token, `${repo}/issues?type=issues&state=${state}&sort=recentupdate&limit=50${label ? `&labels=${encodeURIComponent(label)}` : ''}`),
		api<Label[]>(locals.token, `${repo}/labels?limit=100`)
	]);
	return { issues, state, label, labels };
}
