import { error } from '@sveltejs/kit';
import { parseDiff } from '#lib/diff.js';
import { commit, commitDiff, resolve } from '#lib/server/browse.js';
import { highlightDiff } from '#lib/server/highlight.js';
import { db } from '#lib/server/shed.js';
import { repoFor, toCommits } from '#lib/server/shedrepo.js';

export async function load({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.sha);
	if (!sha) error(404, `No commit ${params.sha}`);
	const [c, diff] = await Promise.all([commit(dir, sha), commitDiff(dir, sha)]);
	return { commit: toCommits(db, [c])[0], files: await highlightDiff(parseDiff(diff)) };
}
