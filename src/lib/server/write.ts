import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { git } from './git.js';

export type Change = { path: string; content: string | Uint8Array<ArrayBuffer> | null; mode?: '100644' | '100755' };
export type Person = { name: string; email: string };

// Makes a commit without a checkout: a throwaway index starts from the parent's tree, takes the changes (null deletes), and the
// branch moves only if it still points at the parent (compare-and-swap), so a concurrent push is never overwritten.
// `newBranch` makes `branch` fresh off `parent` (it must not exist yet).
export async function commitFiles(dir: string, o: { branch: string; parent: string | null; changes: Change[]; message: string; author: Person; committer?: Person; newBranch?: boolean }) {
	const index = `${tmpdir()}/shed-index-${crypto.randomUUID()}`;
	const who = o.committer ?? o.author;
	const env = {
		GIT_INDEX_FILE: index,
		GIT_AUTHOR_NAME: o.author.name,
		GIT_AUTHOR_EMAIL: o.author.email,
		GIT_COMMITTER_NAME: who.name,
		GIT_COMMITTER_EMAIL: who.email
	};
	try {
		if (o.parent) await git(dir, ['read-tree', o.parent], undefined, env);
		// One --index-info batch (bare repos have no work tree for --force-remove); mode 0 removes a path.
		let info = '';
		for (const c of o.changes) {
			if (!c.path || c.path.split('/').some((p) => !p || p === '.' || p === '..' || p === '.git')) throw new Error(`Invalid path: ${c.path}`);
			const sha = c.content === null ? '0'.repeat(40) : (await git(dir, ['hash-object', '-w', '--stdin'], c.content)).trim();
			info += `${c.content === null ? '0' : (c.mode ?? '100644')} ${sha}\t${c.path}\0`;
		}
		await git(dir, ['update-index', '-z', '--index-info'], info, env);
		const tree = (await git(dir, ['write-tree'], undefined, env)).trim();
		const commit = (await git(dir, ['commit-tree', tree, ...(o.parent ? ['-p', o.parent] : []), '-F', '-'], o.message, env)).trim();
		await git(dir, ['update-ref', `refs/heads/${o.branch}`, commit, o.newBranch ? '0'.repeat(40) : (o.parent ?? '0'.repeat(40))]);
		return commit;
	} finally {
		await rm(index, { force: true });
	}
}
