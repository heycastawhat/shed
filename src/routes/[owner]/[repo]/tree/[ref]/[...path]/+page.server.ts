import { loadTree } from '#lib/server/tree.js';

export async function load({ locals, params }) {
	return loadTree(locals, params.owner, params.repo, params.ref, params.path);
}
