import { FORGEJO_URL } from '$app/env/private';
import { api, request } from '#lib/server/forgejo.js';

type Page = { title: string; sub_url: string; content_base64: string; html_url: string; last_commit: { author: { name: string }; created: string } | null };

// Forgejo's /markdown doesn't expand [[Page]] or [[Text|Page]] links, so they become plain links first.
const wikiLinks = (md: string) => md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => `[${a}](${encodeURIComponent((b ?? a).trim().replaceAll(' ', '-'))})`);

export async function wikiPage(token: string | undefined, repo: string, name: string) {
	const [pages, page] = await Promise.all([
		api<{ title: string; sub_url: string }[]>(token, `/repos/${repo}/wiki/pages?limit=100`).catch(() => []),
		api<Page>(token, `/repos/${repo}/wiki/page/${encodeURIComponent(name)}`).catch(() => null)
	]);
	if (!page) return { pages, page: null };
	const base = `${FORGEJO_URL}/${repo}/wiki/`;
	const md = new TextDecoder().decode(Uint8Array.fromBase64(page.content_base64));
	const res = await request(token, '/markdown', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ Text: wikiLinks(md), Mode: 'wiki', Context: base })
	});
	// Page links come back under Forgejo's wiki URL; images stay on Forgejo's raw wiki files.
	const html = (await res.text()).replaceAll(`src="${base}`, `src="${base}raw/`).replaceAll(`href="${base}`, `href="/${repo}/wiki/`);
	return { pages, page: { title: page.title, name: page.sub_url, html, edit: `${page.html_url}?action=_edit`, updated: page.last_commit && { by: page.last_commit.author.name, at: page.last_commit.created } } };
}
