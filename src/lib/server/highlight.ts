import { bundledLanguagesInfo, codeToHtml, codeToTokens, stringifyTokenStyle, type BundledLanguage } from 'shiki';
import type { FileDiff } from '#lib/diff.js';

const langs = new Map<string, BundledLanguage>();
for (const l of bundledLanguagesInfo) for (const name of [l.id, ...(l.aliases ?? [])]) langs.set(name, l.id as BundledLanguage);

export function languageFor(filename: string) {
	const name = filename.toLowerCase();
	return langs.get(name) ?? langs.get(name.split('.').pop()!) ?? ('text' as const);
}

export function highlight(code: string, filename: string) {
	return codeToHtml(code, {
		lang: languageFor(filename),
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: false
	});
}

const MAX_DIFF_LINES = 3000;
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

export async function highlightLines(texts: string[], lang: BundledLanguage | 'text') {
	if (lang === 'text') return texts.map(escape);
	const { tokens } = await codeToTokens(texts.join('\n'), {
		lang,
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: false
	});
	return texts.map((_, i) =>
		(tokens[i] ?? []).map((t) => `<span style="${stringifyTokenStyle(t.htmlStyle ?? {})}">${escape(t.content)}</span>`).join('')
	);
}

// Highlights each hunk as one block so multi-line constructs keep their colours across lines.
export async function highlightDiff(files: FileDiff[]) {
	for (const f of files) {
		const total = f.hunks.reduce((n, h) => n + h.lines.length, 0);
		const lang = total > MAX_DIFF_LINES ? 'text' : languageFor(f.to.split('/').pop()!);
		for (const h of f.hunks) {
			const html = await highlightLines(h.lines.map((l) => l.text), lang);
			h.lines.forEach((l, i) => (l.html = html[i]));
		}
	}
	return files;
}
