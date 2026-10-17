import { api, type Commit } from '#lib/server/forgejo.js';

export async function load({ locals, params }) {
	return { commits: await api<Commit[]>(locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}/commits?stat=false&verification=false&files=false`) };
}
