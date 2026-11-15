import { error, json } from '@sveltejs/kit';
import { allPaths, resolve } from '#lib/server/browse.js';
import { repoFor } from '#lib/server/shedrepo.js';

// Every file path at a ref, for the Go to file finder.
export async function GET({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha) error(404, `No branch, tag or commit called ${params.ref}`);
	return json(await allPaths(dir, sha), { headers: { 'cache-control': 'private, max-age=30' } });
}
