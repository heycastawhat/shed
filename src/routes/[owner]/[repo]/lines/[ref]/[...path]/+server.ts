import { json } from '@sveltejs/kit';
import { encodePath, request } from '#lib/server/forgejo.js';
import { highlightLines, languageFor } from '#lib/server/highlight.js';

// Lines `from`..`to` (1-based, inclusive) of a file, highlighted, for expanding diff context.
export async function GET({ locals, params, url }) {
	const res = await request(locals.token, `/repos/${params.owner}/${params.repo}/raw/${encodePath(params.path)}?ref=${encodeURIComponent(params.ref)}`);
	const from = Number(url.searchParams.get('from'));
	const texts = (await res.text()).replace(/\n$/, '').split('\n').slice(from - 1, Number(url.searchParams.get('to')));
	const html = await highlightLines(texts, languageFor(params.path.split('/').pop()!));
	return json(texts.map((text, i) => ({ text, html: html[i] })));
}
