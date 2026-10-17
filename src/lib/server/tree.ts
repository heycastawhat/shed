import { api, encodePath, renderMarkdown, type Commit, type Entry } from './forgejo.js';

const order = { dir: 0, submodule: 0, symlink: 1, file: 1 };

export async function loadTree(token: string | undefined, repo: string, ref: string, path: string) {
	const entries = await api<Entry[]>(token, `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
	entries.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
	const readme = entries.find((e) => e.type === 'file' && /^readme(\.(md|markdown|txt))?$/i.test(e.name));
	const [last, md] = await Promise.all([lastCommits(token, repo, entries), readme && loadReadme(token, repo, ref, readme)]);
	return { entries, last, readme: md };
}

// Each entry carries its last commit's sha; fetch each distinct commit once for its subject and date.
async function lastCommits(token: string | undefined, repo: string, entries: Entry[]) {
	const shas = [...new Set(entries.map((e) => e.last_commit_sha).filter((s) => s !== undefined))].slice(0, 40);
	const commits = await Promise.all(shas.map((sha) => api<Commit>(token, `/repos/${repo}/git/commits/${sha}?stat=false&files=false&verification=false`)));
	return Object.fromEntries(commits.map((c) => [c.sha, { title: c.commit.message.split('\n')[0], date: c.commit.author.date }]));
}

async function loadReadme(token: string | undefined, repo: string, ref: string, entry: Entry) {
	const file = await api<Entry>(token, `/repos/${repo}/contents/${encodePath(entry.path)}?ref=${encodeURIComponent(ref)}`);
	const text = new TextDecoder().decode(Uint8Array.fromBase64(file.content ?? ''));
	return { name: entry.name, html: await renderMarkdown(token, text, repo, { ref, dir: entry.path.split('/').slice(0, -1).join('/') }) };
}
