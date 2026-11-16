import { error } from '@sveltejs/kit';
import { codeToTokens } from 'shiki';
import * as browse from '../browse.js';
import { languageFor } from '../highlight.js';
import { refSha, repoOf } from './common.js';
import { route } from './router.js';

// Shed's own, for the Android app, which draws code natively: Shiki's tokens with the web's light and dark colours.
// `lines` is the text to colour (a file, or a diff hunk's lines), `filename` picks the language.
const MAX_LINES = 5000;
route('POST', '/highlight', async (c) => {
	const b = await c.body<{ filename?: string; lines?: string[] }>();
	if (!Array.isArray(b.lines)) error(400, 'Send lines');
	const lines = b.lines.slice(0, MAX_LINES).map(String);
	const lang = languageFor((b.filename ?? '').split('/').pop() ?? '');
	if (lang === 'text') return { lang, lines: lines.map((t) => [{ t }]) };
	const { tokens } = await codeToTokens(lines.join('\n'), { lang, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false });
	return {
		lang,
		lines: lines.map((_, i) =>
			(tokens[i] ?? []).map((t) => {
				const s = (t.htmlStyle ?? {}) as Record<string, string>;
				return { t: t.content, l: s['--shiki-light'], d: s['--shiki-dark'], i: s['--shiki-light-font-style'] === 'italic' || undefined };
			})
		)
	};
});

// Who last changed each line: the commits, and ranges of lines from each (as the web's blame page).
route('GET', '/repos/:owner/:repo/blame/*path', async (c) => {
	const r = repoOf(c);
	const ref = c.url.searchParams.get('ref') || r.row.default_branch;
	const sha = (await refSha(r.dir, ref)) ?? error(404, 'Ref not found');
	if ((await browse.objectType(r.dir, sha, c.params.path)) !== 'blob') error(404, `${c.params.path} isn't a file`);
	const text = new TextDecoder().decode(await browse.readBlob(r.dir, sha, c.params.path));
	return { ...(await browse.blame(r.dir, sha, c.params.path)), lines: text.replace(/\n$/, '').split('\n') };
});
