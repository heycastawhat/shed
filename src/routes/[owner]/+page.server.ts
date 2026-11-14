import { api, type Repo, type User } from '#lib/server/forgejo.js';
import { feedEvents, type Feed } from '#lib/server/feed.js';

type Owner = User & { description: string; website: string; location: string; created: string; followers_count: number; following_count: number; starred_repos_count: number };
type Org = User & { name: string; description: string; website: string; location: string };
// Contributions per day for the last 53 weeks, ending today, starting on a Sunday so the grid's rows are weekdays.
function calendar(heat: { timestamp: number; contributions: number }[]) {
	const day = (d: Date) => d.toLocaleDateString('en-CA');
	const counts = new Map<string, number>();
	for (const h of heat) counts.set(day(new Date(h.timestamp * 1000)), (counts.get(day(new Date(h.timestamp * 1000))) ?? 0) + h.contributions);
	const start = new Date();
	start.setDate(start.getDate() - 52 * 7 - start.getDay());
	const days = [];
	for (const d = start; d <= new Date(); d.setDate(d.getDate() + 1)) days.push({ date: day(d), count: counts.get(day(d)) ?? 0 });
	return days;
}

export async function load({ locals, params }) {
	const [owner, repos, members] = await Promise.all([
		api<Owner>(locals.token, `/users/${params.owner}`),
		api<Repo[]>(locals.token, `/users/${params.owner}/repos?limit=50`),
		// Only orgs have members; a user 404s here.
		api<User[]>(locals.token, `/orgs/${params.owner}/members?limit=50`).catch(() => null)
	]);
	const org = !!members;
	const [orgs, heat, feed] = await Promise.all([
		org ? [] : api<Org[]>(locals.token, `/users/${params.owner}/orgs`).catch(() => []),
		org ? [] : api<{ timestamp: number; contributions: number }[]>(locals.token, `/users/${params.owner}/heatmap`).catch(() => []),
		api<Feed[]>(locals.token, org ? `/orgs/${params.owner}/activities/feeds?limit=40` : `/users/${params.owner}/activities/feeds?only-performed-by=true&limit=40`).catch(() => [])
	]);
	repos.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	return { owner, repos, members, orgs, days: org ? null : calendar(heat), feed: feedEvents(feed) };
}
