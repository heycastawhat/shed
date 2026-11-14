import { FORGEJO_URL } from '$app/env/private';
import { wikiPage } from '#lib/server/wiki.js';

export async function load({ locals, params }) {
	const repo = `${params.owner}/${params.repo}`;
	return { ...(await wikiPage(locals.token, repo, params.page ?? 'Home')), name: params.page ?? 'Home', forgejo: `${FORGEJO_URL}/${repo}/wiki` };
}
