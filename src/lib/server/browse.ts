import { git, gitBytes, gitTry, spawn } from './git.js';

// Reading a repo with git. Refs from URLs go through resolve() first, so nothing user-typed reaches git as an option.

export async function resolve(dir: string, ref: string) {
	if (!ref || ref.startsWith('-')) return null;
	return (await gitTry(dir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]))?.trim() || null;
}

export async function isEmpty(dir: string) {
	return !(await git(dir, ['for-each-ref', '--count=1', '--format=x', 'refs/heads'])).trim();
}

export type RefInfo = { name: string; sha: string; date: string; subject: string; author: string; email: string };

async function refs(dir: string, prefix: string, extra = '') {
	const out = await git(dir, [
		'for-each-ref',
		'--sort=-creatordate',
		`--format=%(refname:lstrip=2)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(contents:subject)%00%(authorname)%00%(authoremail:trim)${extra}`,
		prefix
	]);
	return out
		.split('\n')
		.filter(Boolean)
		.map((l) => l.split('\0'));
}

export async function branches(dir: string): Promise<RefInfo[]> {
	return (await refs(dir, 'refs/heads')).map(([name, sha, , date, subject, author, email]) => ({ name, sha, date, subject, author, email }));
}

// An annotated tag points at a tag object; `peeled` is the commit either way, and `message` is the tag's own message when it has one.
export async function tags(dir: string) {
	return (await refs(dir, 'refs/tags', '%00%(objecttype)%00%(*committerdate:iso-strict)%00%(committerdate:iso-strict)')).map(
		([name, sha, peeled, date, subject, , , type, peeledDate, ownDate]) => ({
			name,
			sha: peeled || sha,
			annotated: type === 'tag',
			message: type === 'tag' ? subject : '',
			date: date || peeledDate || ownDate
		})
	);
}

export type TreeEntry = { name: string; path: string; sha: string; type: 'file' | 'dir' | 'symlink' | 'submodule'; size: number };

export async function tree(dir: string, sha: string, path: string): Promise<TreeEntry[] | null> {
	const out = await gitTry(dir, ['ls-tree', '-z', '--long', path ? `${sha}:${path}` : sha]);
	if (out === null) return null;
	return out
		.split('\0')
		.filter(Boolean)
		.map((l) => {
			const [meta, name] = [l.slice(0, l.indexOf('\t')), l.slice(l.indexOf('\t') + 1)];
			const [mode, kind, object, size] = meta.split(/\s+/);
			const type = kind === 'tree' ? 'dir' : kind === 'commit' ? 'submodule' : mode === '120000' ? 'symlink' : 'file';
			return { name, path: path ? `${path}/${name}` : name, sha: object, type, size: Number(size) || 0 };
		});
}

export type Last = { sha: string; title: string; date: string };

// The last commit to touch each entry: walk history under `path` once and take the first commit that names each entry.
// Capped, so a huge old repo shows blanks for long-untouched entries rather than taking seconds.
export async function lastCommits(dir: string, sha: string, path: string, names: string[]) {
	const out = await git(dir, ['log', '--max-count=2000', '--format=%x01%H%x00%cI%x00%s', '--name-only', '--no-renames', sha, '--', path || '.']);
	const want = new Set(names);
	const found: Record<string, Last> = {};
	const prefix = path ? `${path}/` : '';
	for (const chunk of out.split('\x01')) {
		if (!want.size) break;
		const [head, ...files] = chunk.split('\n');
		if (!head) continue;
		const [csha, date, title] = head.split('\0');
		for (const f of files) {
			const name = f.startsWith(prefix) ? f.slice(prefix.length).split('/')[0] : '';
			if (name && want.delete(name)) found[name] = { sha: csha, title, date };
		}
	}
	return found;
}

export async function objectType(dir: string, sha: string, path: string) {
	return (await gitTry(dir, ['cat-file', '-t', `${sha}:${path}`]))?.trim() ?? null;
}

export async function blobSize(dir: string, sha: string, path: string) {
	return Number(await git(dir, ['cat-file', '-s', `${sha}:${path}`]));
}

export const readBlob = (dir: string, sha: string, path: string) => gitBytes(dir, ['cat-file', 'blob', `${sha}:${path}`]);

// For large files: the blob's bytes as a stream.
export function streamBlob(dir: string, sha: string, path: string) {
	return spawn(['--git-dir', dir, 'cat-file', 'blob', `${sha}:${path}`]).stdout;
}

export type CommitInfo = { sha: string; parents: string[]; author: string; email: string; date: string; committer: string; committerEmail: string; committed: string; message: string };

const FORMAT = '%H%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B%x01';
const parse = (out: string): CommitInfo[] =>
	out
		.split('\x01')
		.map((c) => c.replace(/^\n/, ''))
		.filter(Boolean)
		.map((c) => {
			const [sha, parents, author, email, date, committer, committerEmail, committed, message] = c.split('\0');
			return { sha, parents: parents ? parents.split(' ') : [], author, email, date, committer, committerEmail, committed, message: message.replace(/\n+$/, '') };
		});

export async function log(dir: string, sha: string, opts: { skip?: number; limit?: number; path?: string } = {}) {
	const args = ['log', `--format=${FORMAT}`, `--skip=${opts.skip ?? 0}`, `--max-count=${opts.limit ?? 30}`, sha];
	if (opts.path) args.push('--', opts.path);
	return parse(await git(dir, args));
}

export async function count(dir: string, sha: string, path?: string) {
	return Number(await git(dir, ['rev-list', '--count', sha, ...(path ? ['--', path] : [])]));
}

export async function commit(dir: string, sha: string) {
	const [c] = parse(await git(dir, ['show', '--no-patch', `--format=${FORMAT}`, sha]));
	return c;
}

// A commit's diff against its first parent (the whole tree for a root commit), as a git-style unified diff.
export const commitDiff = (dir: string, sha: string) => git(dir, ['show', '--format=', '--no-color', '--find-renames', '--diff-merges=first-parent', '--patch', sha]);

export const diff = (dir: string, from: string, to: string) => git(dir, ['diff', '--no-color', '--find-renames', from, to]);

// Commits in `head` not in `base`, and the other way round.
export async function aheadBehind(dir: string, base: string, head: string) {
	const [behind, ahead] = (await git(dir, ['rev-list', '--left-right', '--count', `${base}...${head}`])).trim().split(/\s+/).map(Number);
	return { ahead, behind };
}

export const mergeBase = async (dir: string, a: string, b: string) => (await gitTry(dir, ['merge-base', a, b]))?.trim() || null;
