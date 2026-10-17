import { isHttpError } from '@sveltejs/kit';
import { api, apiPage, type Issue, type Pull } from '#lib/server/forgejo.js';
import { listFilters, PAGE_SIZE } from '#lib/server/issue.js';

export async function load({ locals, params, url }) {
	const repo = `${params.owner}/${params.repo}`;
	const f = await listFilters(locals.token, repo, url);
	const page = { state: f.state, sort: 'recentupdate', limit: String(PAGE_SIZE), page: String(f.page) };
	// The pulls list can't filter by assignee, so then the issues list finds the numbers and each pull is fetched for its branches.
	const assigned = async () => {
		const q = new URLSearchParams({ ...page, type: 'pulls', assigned_by: f.assignee! });
		if (f.label) q.set('labels', f.label);
		if (f.milestoneId) q.set('milestones', String(f.milestoneId));
		const found = await apiPage<Issue>(locals.token, `/repos/${repo}/issues?${q}`).catch((e) => {
			if (isHttpError(e) && e.status === 404) return { items: [], total: 0 };
			throw e;
		});
		return { items: await Promise.all(found.items.map((i) => api<Pull>(locals.token, `/repos/${repo}/pulls/${i.number}`))), total: found.total };
	};
	// Unlike the issues list, the pulls list filters by label id, not name.
	const q = new URLSearchParams(page);
	if (f.labelId) q.set('labels', String(f.labelId));
	if (f.milestoneId) q.set('milestone', String(f.milestoneId));
	const { items: pulls, total } = f.unknown ? { items: [], total: 0 } : f.assignee ? await assigned() : await apiPage<Pull>(locals.token, `/repos/${repo}/pulls?${q}`);
	return { ...f, pulls, total, size: PAGE_SIZE };
}
