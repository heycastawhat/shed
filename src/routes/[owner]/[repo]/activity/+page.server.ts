import { api } from '#lib/server/forgejo.js';
import { feedEvents, type Feed } from '#lib/server/feed.js';

export async function load({ locals, params }) {
	const feed = await api<Feed[]>(locals.token, `/repos/${params.owner}/${params.repo}/activities/feeds?limit=50`).catch(() => []);
	return { feed: feedEvents(feed, 50) };
}
