import { api, type Repo } from '#lib/server/forgejo.js';
import { branches, tags } from '#lib/server/browse.js';
import { loadRepo } from '#lib/server/shedrepo.js';
import { forkParent } from '#lib/server/fork.js';
import { db } from '#lib/server/shed.js';
import { hostsFor } from '#lib/server/t3.js';

export async function load({ locals, params, parent, url }) {
	const { repo, dir } = await loadRepo(locals, params.owner, params.repo, url.origin);
	const [heads, tagList, { user }, fj, mirror] = await Promise.all([
		branches(dir),
		tags(dir),
		parent(),
		// The API's repo carries the PR and issue counts and feature switches.
		api<Repo>(locals.token, `/repos/${repo.full_name}`).catch(() => null),
		api<{ url: string; updated_at: string | null; error: string | null }>(locals.token, `/repos/${repo.full_name}/mirror`).catch(() => null)
	]);
	if (fj) Object.assign(repo, { open_pr_counter: fj.open_pr_counter, open_issues_count: fj.open_issues_count, has_issues: fj.has_issues, has_wiki: fj.has_wiki });
	const names = heads.map((b) => b.name).sort((a, b) => +(b === repo.default_branch) - +(a === repo.default_branch) || a.localeCompare(b));
	const n = (sql: string, ...args: number[]) => db.query<{ n: number }, number[]>(`select count(*) as n from ${sql}`).get(...args)!.n;
	const me = locals.user?.id ?? 0;
	const social = {
		stars: n('stars where repo_id = ?', repo.id),
		watchers: n('watches where repo_id = ?', repo.id),
		forks: n('repos where fork_of = ?', repo.id),
		starred: !!n('stars where repo_id = ? and user_id = ?', repo.id, me),
		watching: !!n('watches where repo_id = ? and user_id = ?', repo.id, me)
	};
	return {
		mirror,
		repo,
		branches: names,
		tags: tagList.length,
		ref: params.ref ?? repo.default_branch,
		agents: !!user && (await hostsFor(user.id)).length > 0,
		social,
		forkedFrom: forkParent(db, repo.id)
	};
}
