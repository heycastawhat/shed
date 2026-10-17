import { api, renderMarkdown, type User } from '#lib/server/forgejo.js';

type Release = {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	draft: boolean;
	prerelease: boolean;
	published_at: string;
	author: User;
	tarball_url: string;
	zipball_url: string;
	assets: { id: number; name: string; size: number; download_count: number; browser_download_url: string }[];
};
type Tag = { name: string; message: string; commit: { sha: string; created: string }; zipball_url: string; tarball_url: string };

export async function load({ locals, parent, url }) {
	const { repo } = await parent();
	const base = `/repos/${repo.full_name}`;
	const [releases, tags] = await Promise.all([api<Release[]>(locals.token, `${base}/releases?limit=50`), api<Tag[]>(locals.token, `${base}/tags?limit=100`)]);
	return {
		tab: url.searchParams.has('tags') || !releases.length ? 'tags' : 'releases',
		releases: await Promise.all(releases.map(async (r) => ({ ...r, html: r.body.trim() ? await renderMarkdown(locals.token, r.body, repo.full_name, { ref: r.tag_name, dir: '' }) : '' }))),
		tags
	};
}
