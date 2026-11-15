import { error } from '@sveltejs/kit';
import { count, log, resolve } from '#lib/server/browse.js';
import { db } from '#lib/server/shed.js';
import { repoFor, toCommits } from '#lib/server/shedrepo.js';

const PER_PAGE = 30;

export async function load({ locals, params, url }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha) error(404, `No branch, tag or commit called ${params.ref}`);
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const [commits, total] = await Promise.all([log(dir, sha, { skip: (page - 1) * PER_PAGE, limit: PER_PAGE }), count(dir, sha)]);
	return { commits: toCommits(db, commits), page, pages: Math.ceil(total / PER_PAGE) };
}
