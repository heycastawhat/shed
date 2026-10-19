import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, encodePath, request, type Commit, type Entry, type Pull, type Repo } from './forgejo.js';
import { refPath } from '#lib/repo.js';

const post = (body: unknown, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export async function social(token: string, repo: string) {
	const [starred, watching] = await Promise.all([
		request(token, `/user/starred/${repo}`).then(
			() => true,
			() => false
		),
		api<{ subscribed: boolean }>(token, `/repos/${repo}/subscription`).then(
			(w) => w.subscribed,
			() => false
		)
	]);
	return { starred, watching };
}

export async function toggleSocial(token: string, repo: string, what: string, on: boolean) {
	const path = what === 'star' ? `/user/starred/${repo}` : what === 'watch' ? `/repos/${repo}/subscription` : error(400, 'Unknown action');
	await request(token, path, { method: on ? 'PUT' : 'DELETE' });
}

// Editing needs push access and a branch to commit to (not a tag or sha).
export async function editable(parent: () => Promise<{ repo: Repo; branches: string[]; ref: string }>) {
	const { repo, branches, ref } = await parent();
	if (!repo.permissions.push || repo.archived) error(403, 'You need write access to edit this repository');
	if (!branches.includes(ref)) error(400, 'Switch to a branch to edit files');
	return repo.full_name;
}

export async function readText(token: string, repo: string, ref: string, path: string) {
	const file = await api<Entry | Entry[]>(token, `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
	if (Array.isArray(file) || file.content == null) error(400, 'Only files small enough for the API can be edited here');
	const bytes = Uint8Array.fromBase64(file.content);
	if (bytes.subarray(0, 8000).includes(0)) error(400, 'Binary files can’t be edited here');
	return { text: new TextDecoder().decode(bytes), sha: file.sha! };
}

export const b64 = (text: string) => new TextEncoder().encode(text).toBase64();

type Op = { operation: 'create' | 'update' | 'delete'; path: string; content?: string; sha?: string; from_path?: string };

// One commit for any mix of operations. Committing to a new branch opens a PR against the current one.
export async function commitFiles(token: string, repo: string, branch: string, files: Op[], form: FormData, fallback: string, then: string) {
	const subject = String(form.get('message') ?? '').trim() || fallback;
	const message = [subject, String(form.get('body') ?? '').trim()].filter(Boolean).join('\n\n');
	const target = form.get('target') === 'new' ? String(form.get('branch') ?? '').trim() : '';
	let pr: number | undefined;
	try {
		await request(token, `/repos/${repo}/contents`, post({ branch, new_branch: target || undefined, message, files }));
		if (target) pr = ((await (await request(token, `/repos/${repo}/pulls`, post({ head: target, base: branch, title: subject, body: String(form.get('body') ?? '') }))).json()) as Pull).number;
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
	redirect(303, pr ? `/${repo}/pulls/${pr}` : `/${repo}/${then}/${refPath(branch, files.find((f) => f.operation !== 'delete')?.path.replace(/\/[^/]*$|^[^/]*$/, (m) => (then === 'tree' ? '' : m)) ?? '')}`);
}

export async function fileTree(token: string, repo: string, ref: string) {
	const paths: string[] = [];
	for (let page = 1; page <= 10; page++) {
		const t = await api<{ tree: { path: string; type: string }[]; truncated: boolean }>(token, `/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1&per_page=1000&page=${page}`);
		paths.push(...t.tree.filter((e) => e.type === 'blob').map((e) => e.path));
		if (!t.truncated) break;
	}
	return paths;
}

const MAX_BLAME_COMMITS = 40;
const MAX_CELLS = 4_000_000;

export type BlameCommit = { sha: string; title: string; date: string; author: string; message: string };

// Forgejo's API has no blame, so walk the file's history and diff each version against the one before it.
// Lines older than the walked history are left unattributed (the caller links out to Forgejo for those).
export async function blame(token: string, repo: string, ref: string, path: string) {
	const history = await api<Commit[]>(token, `/repos/${repo}/commits?sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}&limit=${MAX_BLAME_COMMITS + 1}&stat=false&verification=false&files=false`);
	const commits = history.slice(0, MAX_BLAME_COMMITS);
	const texts = await Promise.all(
		[...commits, ...history.slice(MAX_BLAME_COMMITS)].map((c) =>
			request(token, `/repos/${repo}/raw/${encodePath(path)}?ref=${c.sha}`).then(
				(r) => r.text(),
				() => ''
			)
		)
	);
	const lines = texts.map((t) => (t === '' ? [] : t.replace(/\n$/, '').split('\n')));
	const owner: (number | undefined)[] = lines[0].map(() => undefined);
	// map[i] = index in the version being compared of current line i, or -1 once attributed.
	let map = lines[0].map((_, i) => i);
	for (let k = 0; k < commits.length; k++) {
		const older = k + 1 < lines.length ? lines[k + 1] : [];
		const kept = matchLines(lines[k], older);
		map = map.map((at, i) => {
			if (at < 0) return -1;
			if (kept[at] === undefined) return ((owner[i] = k), -1);
			return kept[at];
		});
		if (k + 1 >= lines.length) break;
	}
	return {
		lines: lines[0],
		owner,
		truncated: history.length > MAX_BLAME_COMMITS,
		commits: commits.map((c) => ({ sha: c.sha, title: c.commit.message.split('\n')[0], message: c.commit.message, date: c.commit.author.date, author: c.author?.login ?? c.commit.author.name }))
	};
}

// For each line of `a`, its index in `b` if it is unchanged (longest common subsequence), else undefined.
function matchLines(a: string[], b: string[]) {
	const out: (number | undefined)[] = [];
	let s = 0;
	while (s < a.length && s < b.length && a[s] === b[s]) out[s] = s++;
	let ea = a.length, eb = b.length;
	while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) out[--ea] = --eb;
	const n = ea - s, m = eb - s;
	if (!n || !m || n * m > MAX_CELLS) return out;
	const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[s + i] === b[s + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
	for (let i = 0, j = 0; i < n && j < m; ) {
		if (a[s + i] === b[s + j]) (out[s + i] = s + j), i++, j++;
		else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
		else j++;
	}
	return out;
}
