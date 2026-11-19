import MarkdownIt from 'markdown-it';
import { RESERVED } from '../reserved.js';

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

// References in prose become links: `#12` (in a repo), `owner/repo#12`, `@login` and commit SHAs (in a repo, 7–40 hex digits with
// at least one digit and one letter, so ordinary words and numbers stay text). Code, existing links and autolinks are left alone.
// Numbers aren't checked: `/issues/N` redirects PRs to `/pulls/N` and a missing one is a plain 404.
const REFS =
	/(?<![\w&/#@.-])(?:([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)?#(\d+)\b|@([A-Za-z0-9](?:[\w.-]*[A-Za-z0-9])?)(?![\w@-]|\.\w)|\b((?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40})\b(?![\w-]))/g;

function refHref(m: RegExpExecArray, repo?: string) {
	const [, other, number, login, sha] = m;
	if (number) return other || repo ? `/${other || repo}/issues/${number}` : null;
	if (login) return login === 'agent' || RESERVED.has(login.toLowerCase()) ? null : `/${login}`;
	return repo ? `/${repo}/commit/${sha}` : null;
}

md.core.ruler.push('shed_refs', (state) => {
	const env = state.env as Env;
	for (const t of state.tokens) {
		if (t.type !== 'inline' || !t.children) continue;
		const out: typeof t.children = [];
		let inLink = 0;
		for (const c of t.children) {
			if (c.type === 'link_open') inLink++;
			if (c.type === 'link_close') inLink--;
			if (c.type !== 'text' || inLink) {
				out.push(c);
				continue;
			}
			let last = 0;
			for (const m of c.content.matchAll(REFS)) {
				const href = refHref(m, env.repo);
				if (!href) continue;
				if (m[3]) env.mentions?.add(m[3].toLowerCase());
				const text = (s: string) => Object.assign(new state.Token('text', '', 0), { content: s });
				if (m.index > last) out.push(text(c.content.slice(last, m.index)));
				const open = new state.Token('link_open', 'a', 1);
				open.attrSet('href', href);
				out.push(open, text(m[0]), new state.Token('link_close', 'a', -1));
				last = m.index + m[0].length;
			}
			if (!last) out.push(c);
			else if (last < c.content.length) out.push(Object.assign(new state.Token('text', '', 0), { content: c.content.slice(last) }));
		}
		t.children = out;
	}
});

type Env = { repo?: string; ref?: string; dir?: string; mentions?: Set<string> };

function resolve(url: string, env: Env, kind: 'blob' | 'raw') {
	if (!env.repo || !env.ref || !url || /^([a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(url)) return url;
	const end = url.search(/[?#]/);
	const path = end < 0 ? url : url.slice(0, end);
	const rest = end < 0 ? '' : url.slice(end);
	const parts = (url.startsWith('/') ? [] : (env.dir ?? '').split('/')).filter(Boolean);
	for (const p of decodeURI(path).split('/')) {
		if (p === '..') parts.pop();
		else if (p && p !== '.') parts.push(p);
	}
	return `/${env.repo}/${kind}/${encodeURIComponent(env.ref)}/${parts.map(encodeURIComponent).join('/')}${rest}`;
}

export const render = (text: string, at?: { repo: string; ref: string; dir: string }) => md.render(text, { ...at });

export function mentions(text: string) {
	const logins = new Set<string>();
	md.parse(text, { mentions: logins });
	return logins;
}
