import { api, type Repo } from '#lib/server/forgejo.js';
import { branches, tags } from '#lib/server/browse.js';
import { loadRepo } from '#lib/server/shedrepo.js';
import { hostsFor } from '#lib/server/t3.js';

export async function load({ locals, params, parent, url }) {
	const { repo, dir } = await loadRepo(locals, params.owner, params.repo, url.origin);
	const [heads, tagList, { user }, fj] = await Promise.all([
		branches(dir),
		tags(dir),
		parent(),
		// Bridge: PRs and issues still live in Forgejo, so their counts come from there until they move.
		locals.token ? api<Repo>(locals.token, `/repos/${repo.full_name}`).catch(() => null) : null
	]);
	if (fj) Object.assign(repo, { open_pr_counter: fj.open_pr_counter, open_issues_count: fj.open_issues_count, has_issues: fj.has_issues, has_wiki: fj.has_wiki });
	const names = heads.map((b) => b.name).sort((a, b) => +(b === repo.default_branch) - +(a === repo.default_branch) || a.localeCompare(b));
	return { repo, branches: names, tags: tagList.length, ref: params.ref ?? repo.default_branch, agents: !!user && (await hostsFor(user.id)).length > 0 };
}
