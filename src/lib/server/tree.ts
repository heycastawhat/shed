import { error } from '@sveltejs/kit';
import { lastCommits, readBlob, resolve, tree } from './browse.js';
import { render } from './markdown.js';
import { db } from './shed.js';
import { repoFor } from './shedrepo.js';

const order = { dir: 0, submodule: 0, symlink: 1, file: 1 };

export async function loadTree(locals: App.Locals, owner: string, name: string, ref: string, path: string) {
	const { dir } = repoFor(locals, owner, name);
	const sha = await resolve(dir, ref);
	if (!sha) error(404, `No branch, tag or commit called ${ref}`);
	const entries = await tree(dir, sha, path);
	if (!entries) error(404, `${path} isn't a folder in ${ref}`);
	entries.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
	const readme = entries.find((e) => e.type === 'file' && /^readme(\.(md|markdown|txt))?$/i.test(e.name));
	const [last, md] = await Promise.all([
		lastCommits(dir, sha, path, entries.map((e) => e.name)),
		readme && readBlob(dir, sha, readme.path).then((b) => {
			const text = new TextDecoder().decode(b);
			return { name: readme.name, html: /\.txt$|^readme$/i.test(readme.name) ? `<pre>${Bun.escapeHTML(text)}</pre>` : render(text, { repo: `${owner}/${name}`, ref, dir: path }, db) };
		})
	]);
	// Pages key last commits by sha; entries carry the sha of the commit that last touched them.
	return {
		entries: entries.map((e) => ({ ...e, last_commit_sha: last[e.name]?.sha })),
		last: Object.fromEntries(Object.values(last).map((l) => [l.sha, { title: l.title, date: l.date }])),
		readme: md
	};
}
