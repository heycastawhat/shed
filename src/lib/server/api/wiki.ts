import { error } from '@sveltejs/kit';
import { saveWikiPage, wikiLinks, wikiPage, wikiPages } from '../wiki.js';
import { repoOf, userRow } from './common.js';
import { me, route } from './router.js';

// A repo's wiki over the API, near Forgejo's (/wiki/pages, /wiki/page/:name, /wiki/new), for the Android app.
// Pages come as Markdown, with [[Page]] links already made into ordinary relative links.
route('GET', '/repos/:owner/:repo/wiki/pages', async (c) => wikiPages(repoOf(c).dir));
route('GET', '/repos/:owner/:repo/wiki/page/:name', async (c) => {
	const r = repoOf(c);
	const { page } = await wikiPage(r.dir, r.full, c.params.name);
	if (!page) error(404, 'No such page');
	return { title: page.title, sub_url: page.name, content: wikiLinks(page.markdown), content_base64: Buffer.from(page.markdown).toString('base64'), last_commit: page.updated };
});

type Body = { title?: string; content?: string; content_base64?: string; message?: string };
async function save(c: Parameters<Parameters<typeof route>[2]>[0], from: string | undefined, deleting = false) {
	const r = repoOf(c, 'write');
	const u = userRow(c.db, me(c).id)!;
	const b = deleting ? {} : await c.body<Body>();
	const text = deleting ? null : (b.content ?? (b.content_base64 ? Buffer.from(b.content_base64, 'base64').toString() : ''));
	const name = (b.title ?? from ?? '').trim();
	if (!name) error(400, 'Give the page a title');
	await saveWikiPage(r.dir, { name, from, text, message: b.message, author: { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` } });
	return deleting ? undefined : { sub_url: name.replaceAll(' ', '-') };
}
route('POST', '/repos/:owner/:repo/wiki/new', (c) => save(c, undefined));
route('PATCH', '/repos/:owner/:repo/wiki/page/:name', (c) => save(c, c.params.name));
route('DELETE', '/repos/:owner/:repo/wiki/page/:name', (c) => save(c, c.params.name, true));
