import { loadTree } from '#lib/server/tree.js';

export async function load({ locals, params }) {
	return loadTree(locals.token, `${params.owner}/${params.repo}`, params.ref, params.path);
}
