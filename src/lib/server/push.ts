import type { Database } from 'bun:sqlite';
import { git } from './git.js';
import { repoDir, type RepoRow } from './repos.js';

export type RefUpdate = { ref: string; before: string | null; after: string | null };
type Listener = (e: { db: Database; root: string; repo: RepoRow; userId: number; updates: RefUpdate[] }) => void | Promise<void>;
const listeners: Listener[] = [];

// Pull requests, CI and webhooks subscribe here to hear about pushes.
export const onPush = (fn: Listener) => listeners.push(fn);

export async function refSnapshot(dir: string) {
	const out = await git(dir, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags']);
	return new Map(
		out
			.split('\n')
			.filter(Boolean)
			.map((l) => l.split(' ') as [string, string])
	);
}

export async function afterPush(db: Database, root: string, repo: RepoRow, userId: number, before: Map<string, string>) {
	const dir = repoDir(root, repo.id);
	const now = await refSnapshot(dir);
	const updates: RefUpdate[] = [];
	for (const [ref, sha] of now) if (before.get(ref) !== sha) updates.push({ ref, before: before.get(ref) ?? null, after: sha });
	for (const [ref, sha] of before) if (!now.has(ref)) updates.push({ ref, before: sha, after: null });
	if (!updates.length) return;
	// The first push to an empty repo may not include the default branch (e.g. pushing only `master`); point HEAD at what exists.
	const head = `refs/heads/${repo.default_branch}`;
	if (!now.has(head)) {
		const branch = ['refs/heads/main', 'refs/heads/master'].find((r) => now.has(r)) ?? [...now.keys()].find((r) => r.startsWith('refs/heads/'));
		if (branch && ![...before.keys()].some((r) => r.startsWith('refs/heads/'))) {
			await git(dir, ['symbolic-ref', 'HEAD', branch]);
			db.query('update repos set default_branch = ? where id = ?').run(branch.slice('refs/heads/'.length), repo.id);
		}
	}
	db.query("update repos set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(repo.id);
	for (const fn of listeners) await Promise.resolve(fn({ db, root, repo, userId, updates })).catch((e) => console.error('push listener', e));
}
