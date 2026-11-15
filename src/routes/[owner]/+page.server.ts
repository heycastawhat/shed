import { error, redirect } from '@sveltejs/kit';
import { toUser, type UserRow } from '#lib/server/accounts.js';
import { heatmap, orgFeed, userFeed } from '#lib/server/activity.js';
import { feedEvents } from '#lib/server/feed.js';
import { db } from '#lib/server/shed.js';
import { visibleRepos } from '#lib/server/shedrepo.js';
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

export function load({ locals, params, url }) {
	if (!locals.user) redirect(303, '/login');
	const row = db.query<UserRow & { created_at: string; description: string; website: string; location: string }, [string]>("select * from users where login = ? and kind != 'agent'").get(params.owner);
	if (!row) error(404, `No user or organization called ${params.owner}`);
	const org = row.kind === 'org';
	const repos = visibleRepos(locals.user.id, url.origin, row.id);
	const visible = visibleRepos(locals.user.id, url.origin).map((r) => r.id);
	const members = org ? db.query<UserRow, [number]>('select u.* from users u join org_members m on m.user_id = u.id where m.org_id = ? order by u.login').all(row.id).map(toUser) : null;
	const orgs = org
		? []
		: db
				.query<UserRow, [number]>("select u.* from users u join org_members m on m.org_id = u.id where m.user_id = ? and u.kind = 'org' order by u.login")
				.all(row.id)
				.map((g) => ({ ...toUser(g), name: g.login }));
	const owner = {
		...toUser(row),
		description: row.description,
		website: row.website,
		location: row.location,
		created: row.created_at,
		followers_count: 0,
		following_count: 0,
		starred_repos_count: 0
	};
	const role = org ? db.query<{ role: string }, [number, number]>('select role from org_members where org_id = ? and user_id = ?').get(row.id, locals.user.id)?.role : null;
	return {
		owner,
		repos,
		members,
		role: role ?? (org && locals.user.admin ? 'admin' : null),
		orgs,
		days: org ? null : calendar(heatmap(db, row.id)),
		feed: feedEvents(org ? orgFeed(db, row.id, visible) : userFeed(db, row.id, visible))
	};
}
