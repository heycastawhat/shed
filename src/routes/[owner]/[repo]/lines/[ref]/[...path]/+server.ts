import { error, json } from '@sveltejs/kit';
import { readBlob, resolve } from '#lib/server/browse.js';
import { highlightLines, languageFor } from '#lib/server/highlight.js';
import { repoFor } from '#lib/server/shedrepo.js';

// Lines `from`..`to` (1-based, inclusive) of a file, highlighted, for expanding diff context.
export async function GET({ locals, params, url }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha) error(404, 'Ref not found');
	const text = new TextDecoder().decode(await readBlob(dir, sha, params.path).catch(() => error(404, 'File not found')));
	const from = Number(url.searchParams.get('from'));
	const texts = text.replace(/\n$/, '').split('\n').slice(from - 1, Number(url.searchParams.get('to')));
	const html = await highlightLines(texts, languageFor(params.path.split('/').pop()!));
	return json(texts.map((text, i) => ({ text, html: html[i] })));
}
