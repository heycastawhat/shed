import { apiPage, type Issue, type Pull } from '#lib/server/forgejo.js';

export type SplitItem = { number: number; title: string; user: string; updated: string; state: 'open' | 'draft' };

// The Split layout's list pane: open PRs or issues, most recently updated first. Only the owner/repo params and a cookie are read, so
// Kit loads it once per repo and keeps it while you move between items; it streams, so the item itself never waits on it.
export function splitList(locals: App.Locals, cookies: { get(name: string): string | undefined }, owner: string, repo: string, kind: 'pulls' | 'issues') {
	if (cookies.get('forge_layout') !== 'split') return null;
	const q = 'state=open&sort=recentupdate&limit=50';
	const list: Promise<SplitItem[]> =
		kind === 'pulls'
			? apiPage<Pull>(locals.token, `/repos/${owner}/${repo}/pulls?${q}`).then((r) =>
					r.items.map((p) => ({ number: p.number, title: p.title, user: p.user.login, updated: p.updated_at ?? p.created_at, state: p.draft ? 'draft' : 'open' }))
				)
			: apiPage<Issue>(locals.token, `/repos/${owner}/${repo}/issues?${q}&type=issues`).then((r) =>
					r.items.map((i) => ({ number: i.number, title: i.title, user: i.user.login, updated: i.updated_at, state: 'open' }))
				);
	return list.catch(() => [] as SplitItem[]);
}
