import { api, encodePath, renderMarkdown, type Entry } from './forgejo.js';

const order = { dir: 0, submodule: 0, symlink: 1, file: 1 };

export async function loadTree(token: string | undefined, repo: string, ref: string, path: string) {
	const entries = await api<Entry[]>(token, `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
	entries.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
	const readme = entries.find((e) => e.type === 'file' && /^readme(\.(md|markdown|txt))?$/i.test(e.name));
	return { entries, readme: readme && (await loadReadme(token, repo, ref, readme)) };
}

async function loadReadme(token: string | undefined, repo: string, ref: string, entry: Entry) {
	const file = await api<Entry>(token, `/repos/${repo}/contents/${encodePath(entry.path)}?ref=${encodeURIComponent(ref)}`);
	const text = new TextDecoder().decode(Uint8Array.fromBase64(file.content ?? ''));
	return { name: entry.name, html: await renderMarkdown(token, text, repo) };
}
