import { api, apiPage, type Repo } from '#lib/server/forgejo.js';
import type { CodeHit } from '#lib/server/api/search.js';

type Found = {
	number: number;
	title: string;
	state: 'open' | 'closed';
	updated_at: string;
	user: { login: string };
	repository: { full_name: string };
	pull_request: { merged: boolean } | null;
};

export async function load({ locals, url }) {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const tab = (['code', 'repos'] as const).find((t) => t === url.searchParams.get('type')) ?? 'issues';
	if (!q) return { q, tab, issues: [], issueTotal: 0, code: [], repos: [] };
	const enc = encodeURIComponent(q);
	const [issues, code, repos] = await Promise.all([
		apiPage<Found>(locals.token, `/repos/issues/search?q=${enc}&state=all&sort=recentupdate&limit=50`),
		api<{ data: CodeHit[] }>(locals.token, `/repos/code/search?q=${enc}&limit=100`),
		api<{ data: Repo[] }>(locals.token, `/repos/search?q=${enc}&limit=50`)
	]);
	return { q, tab, issues: issues.items, issueTotal: issues.total, code: code.data, repos: repos.data };
}
