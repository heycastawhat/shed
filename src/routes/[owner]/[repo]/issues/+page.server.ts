import { isHttpError } from '@sveltejs/kit';
import { apiPage, type Issue } from '#lib/server/forgejo.js';
import { listFilters, PAGE_SIZE } from '#lib/server/issue.js';

export async function load({ locals, params, url }) {
	const repo = `${params.owner}/${params.repo}`;
	const f = await listFilters(locals.token, repo, url);
	const q = new URLSearchParams({ type: 'issues', state: f.state, sort: 'recentupdate', limit: String(PAGE_SIZE), page: String(f.page) });
	if (f.label) q.set('labels', f.label);
	if (f.milestoneId) q.set('milestones', String(f.milestoneId));
	if (f.assignee) q.set('assigned_by', f.assignee);
	// An unknown assignee is a 404 rather than an empty list.
	const { items: issues, total } = f.unknown
		? { items: [], total: 0 }
		: await apiPage<Issue>(locals.token, `/repos/${repo}/issues?${q}`).catch((e) => {
				if (isHttpError(e) && e.status === 404 && f.assignee) return { items: [] as Issue[], total: 0 };
				throw e;
			});
	return { ...f, issues, total, size: PAGE_SIZE };
}
