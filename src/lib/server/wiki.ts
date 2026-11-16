import { error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { git, gitTry, initBare } from './git.js';
import { render } from './markdown.js';
import { commitFiles, type Change } from './write.js';

// A repo's wiki is a second bare repo beside it (<id>.wiki.git), one markdown file per page, as Forgejo and GitHub keep them, so it
// can be cloned and edited with git too. Page names use dashes for spaces in file names ("Getting Started" ↔ Getting-Started.md).
export const wikiDir = (repoDir: string) => repoDir.replace(/\.git$/, '.wiki.git');
const file = (name: string) => `${name.trim().replaceAll(' ', '-')}.md`;
const title = (path: string) => path.replace(/\.md$/, '').replaceAll('-', ' ');

async function head(dir: string) {
	if (!existsSync(dir)) return null;
	return (await gitTry(dir, ['rev-parse', '--verify', '--quiet', 'refs/heads/main']))?.trim() || null;
}

export async function wikiPages(repoDir: string) {
	const dir = wikiDir(repoDir);
	const sha = await head(dir);
	if (!sha) return [];
	return (await git(dir, ['ls-tree', '--name-only', sha]))
		.split('\n')
		.filter((f) => f.endsWith('.md'))
		.map((f) => ({ title: title(f), sub_url: f.replace(/\.md$/, '') }))
		.sort((a, b) => +(b.sub_url === 'Home') - +(a.sub_url === 'Home') || a.title.localeCompare(b.title));
}

// [[Page]] and [[Text|Page]] become links to the page; other relative links and images resolve inside the wiki.
export const wikiLinks = (md: string) => md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => `[${a}](${encodeURIComponent((b ?? a).trim().replaceAll(' ', '-'))})`);

export async function wikiPage(repoDir: string, repo: string, name: string) {
	const dir = wikiDir(repoDir);
	const pages = await wikiPages(repoDir);
	const sha = await head(dir);
	const path = file(name);
	const md = sha ? await gitTry(dir, ['cat-file', 'blob', `${sha}:${path}`]) : null;
	if (md === null) return { pages, page: null };
	const [when, by] = (await git(dir, ['log', '-1', '--format=%cI%x00%an', sha!, '--', path])).trim().split('\0');
	const html = render(wikiLinks(md), { repo, ref: '', dir: '' })
		.replace(/href="(?![a-z][a-z0-9+.-]*:|\/|#)([^"]+)"/gi, `href="/${repo}/wiki/$1"`)
		.replace(/src="(?![a-z][a-z0-9+.-]*:|\/)([^"]+)"/gi, `src="/${repo}/wiki/raw/$1"`);
	return { pages, page: { title: title(path), name: path.replace(/\.md$/, ''), html, markdown: md, updated: { by, at: when } } };
}

// Saves a page (renaming it when `from` differs), or deletes it when text is null. Creates the wiki on first save.
export async function saveWikiPage(repoDir: string, o: { name: string; from?: string; text: string | null; message?: string; author: { name: string; email: string } }) {
	if (!o.name.trim() || /[/\\]|^\.|\.\./.test(o.name)) error(400, "Page names can't contain / or \\ or start with a dot");
	const dir = wikiDir(repoDir);
	if (!existsSync(dir)) await initBare(dir, 'main');
	const parent = await head(dir);
	const path = file(o.name);
	const changes: Change[] = o.text === null ? [{ path, content: null }] : [{ path, content: o.text.replace(/\r\n/g, '\n') }];
	if (o.from && file(o.from) !== path) changes.push({ path: file(o.from), content: null });
	await commitFiles(dir, {
		branch: 'main',
		parent,
		changes,
		message: o.message?.trim() || `${o.text === null ? 'Delete' : parent && (await gitTry(dir, ['cat-file', '-e', `${parent}:${path}`])) !== null ? 'Update' : 'Add'} ${title(path)}`,
		author: o.author
	});
}

