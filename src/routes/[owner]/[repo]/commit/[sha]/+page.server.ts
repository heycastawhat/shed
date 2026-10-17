import { api, type CommitDetail } from '#lib/server/forgejo.js';
import { loadDiff } from '#lib/server/diff.js';

export async function load({ locals, params }) {
	const base = `/repos/${params.owner}/${params.repo}/git/commits/${params.sha}`;
	const [commit, files] = await Promise.all([
		api<CommitDetail>(locals.token, `${base}?stat=false&verification=false&files=false`),
		loadDiff(locals.token, `${base}.diff`)
	]);
	return { commit, files };
}
