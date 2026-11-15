import { loadTree } from '#lib/server/tree.js';

export async function load({ locals, params, parent }) {
	const { repo, ref } = await parent();
	return repo.empty ? { entries: [], last: {}, readme: undefined } : loadTree(locals, params.owner, params.repo, ref, '');
}
