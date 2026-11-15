import MarkdownIt from 'markdown-it';

// Raw HTML in markdown is escaped (html: false), so output is safe to {@html} without a sanitiser; markdown-it already refuses
// javascript:/vbscript:/data: links. Relative links and images in a repo file resolve against that file's folder to Shed's blob/raw URLs.
const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

const slug = (s: string) =>
	s
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-');

md.core.ruler.push('shed', (state) => {
	const env = state.env as Env;
	const seen = new Map<string, number>();
	const tokens = state.tokens;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		// Heading anchors, as GitHub/Forgejo make them (#install, #install-1, …).
		if (t.type === 'heading_open') {
			const base = slug(tokens[i + 1].children?.map((c) => c.content).join('') ?? '');
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			t.attrSet('id', n ? `${base}-${n}` : base);
		}
		// GitHub task lists: "- [ ] x" / "- [x] x" become disabled checkboxes.
		if (t.type === 'inline' && tokens[i - 1]?.type === 'paragraph_open' && tokens[i - 2]?.type === 'list_item_open') {
			const m = t.content.match(/^\[([ xX])\] /);
			const first = t.children?.[0];
			if (m && first?.type === 'text') {
				first.content = first.content.slice(4);
				const box = new state.Token('html_inline', '', 0);
				box.content = `<input type="checkbox" disabled${m[1] === ' ' ? '' : ' checked'}> `;
				t.children!.unshift(box);
				tokens[i - 2].attrJoin('class', 'task-list-item');
			}
		}
		for (const c of t.children ?? []) {
			if (c.type === 'link_open') c.attrSet('href', resolve(String(c.attrGet('href') ?? ''), env, 'blob'));
			if (c.type === 'image') c.attrSet('src', resolve(String(c.attrGet('src') ?? ''), env, 'raw'));
		}
	}
});

type Env = { repo?: string; ref?: string; dir?: string };

function resolve(url: string, env: Env, kind: 'blob' | 'raw') {
	if (!env.repo || !env.ref || !url || /^([a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(url)) return url;
	const [path, rest = ''] = url.split(/(?=[?#])/, 2) as [string, string?];
	const parts = (url.startsWith('/') ? [] : (env.dir ?? '').split('/')).filter(Boolean);
	for (const p of decodeURI(path).split('/')) {
		if (p === '..') parts.pop();
		else if (p && p !== '.') parts.push(p);
	}
	return `/${env.repo}/${kind}/${encodeURIComponent(env.ref)}/${parts.map(encodeURIComponent).join('/')}${rest}`;
}

export const render = (text: string, at?: { repo: string; ref: string; dir: string }) => md.render(text, { ...at });
