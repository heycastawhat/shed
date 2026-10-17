import { loadTree } from '#lib/server/tree.js';

export async function load({ locals, parent }) {
	const { repo, ref } = await parent();
	return repo.empty ? { entries: [], last: {}, readme: undefined } : loadTree(locals.token, repo.full_name, ref, '');
}
