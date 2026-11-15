import type { Database } from 'bun:sqlite';
import { git } from './git.js';
import { createRepo, deleteRepo, getRepo, repoDir, type RepoRow } from './repos.js';

// A fork is a new repo with `fork_of` set and every branch and tag fetched from the source's bare repo. It's private if the source is.
export async function forkRepo(db: Database, root: string, source: RepoRow, ownerId: number, name = source.name) {
	const id = await createRepo(db, root, ownerId, { name, description: source.description, private: !!source.private, defaultBranch: source.default_branch });
	try {
		await git(repoDir(root, id), ['fetch', '--quiet', '--no-tags', repoDir(root, source.id), '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);
	} catch (e) {
		await deleteRepo(db, root, id);
		throw e;
	}
	db.query('update repos set fork_of = ? where id = ?').run(source.id, id);
	const owner = db.query<{ login: string }, [number]>('select login from users where id = ?').get(ownerId)!.login;
	return getRepo(db, owner, name)!;
}

export function forkParent(db: Database, id: number) {
	return db.query<{ owner: string; name: string }, [number]>('select u.login as owner, p.name from repos r join repos p on p.id = r.fork_of join users u on u.id = p.owner_id where r.id = ?').get(id);
}
