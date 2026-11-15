import { releaseActions } from '#lib/server/release.js';
import { tags } from '#lib/server/browse.js';
import { repoFor } from '#lib/server/shedrepo.js';

export async function load({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo, 'write');
	return { tagNames: (await tags(dir)).map((t) => t.name), release: null };
}

export const actions = { save: releaseActions.save };
