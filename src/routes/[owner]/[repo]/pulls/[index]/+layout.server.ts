import { api, type Pull } from '#lib/server/forgejo.js';

export async function load({ locals, params }) {
	return { pull: await api<Pull>(locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}`) };
}
