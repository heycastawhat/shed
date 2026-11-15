import { releaseActions, type Release } from '#lib/server/release.js';
import { tags } from '#lib/server/browse.js';
import { api } from '#lib/server/forgejo.js';
import { repoFor } from '#lib/server/shedrepo.js';

export async function load({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo, 'write');
	const [tagNames, release] = await Promise.all([tags(dir).then((ts) => ts.map((t) => t.name)), api<Release>(locals.token, `/repos/${params.owner}/${params.repo}/releases/${Number(params.id)}`)]);
	return { tagNames, release };
}

export const actions = releaseActions;
