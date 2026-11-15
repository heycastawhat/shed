import { repoFeed } from '#lib/server/activity.js';
import { feedEvents } from '#lib/server/feed.js';
import { db } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';

export function load({ locals, params }) {
	const { row } = repoFor(locals, params.owner, params.repo);
	return { feed: feedEvents(repoFeed(db, row.id), 50) };
}
