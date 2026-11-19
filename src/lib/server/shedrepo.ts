import type { Database } from 'bun:sqlite';
import { error, redirect } from '@sveltejs/kit';
import { access, atLeast, type Level } from './access.js';
import { toUser, type UserRow } from './accounts.js';
import { toRepo } from './shedrepo-shape.js';
import { isEmpty, type CommitInfo } from './browse.js';
import type { Commit, Repo } from './forgejo.js';
import { getRepo, repoDir, type RepoRow } from './repos.js';
import { db, root } from './shed.js';

// Shed's rows in the shapes forge's pages already take (they were written against Forgejo's API), so pages move over without UI changes.
export { toRepo };

// The repo a request is about, if this person may see it; 404 otherwise (so private repos don't reveal they exist), or a sign-in for anonymous visitors.
export function repoFor(locals: App.Locals, owner: string, name: string, need: Level = 'read') {
	const row = getRepo(db, owner, name);
	const level = row ? access(db, locals.user?.id, row) : 'none';
	if (!row || !atLeast(level, 'read')) {
		if (!locals.user) redirect(303, '/login');
		error(404, 'Repository not found');
	}
	if (!atLeast(level, need)) error(403, `You need ${need} access to ${owner}/${name}`);
	if (need !== 'read' && row.archived) error(403, `${owner}/${name} is archived`);
	return { row, level, dir: repoDir(root, row.id) };
}

export async function loadRepo(locals: App.Locals, owner: string, name: string, origin: string) {
	const r = repoFor(locals, owner, name);
	const ownerRow = db.query<UserRow, [number]>('select * from users where id = ?').get(r.row.owner_id)!;
	return { ...r, repo: toRepo(r.row, ownerRow, r.level, await isEmpty(r.dir), origin) };
}

// Commit authors are matched to Shed accounts by email, like Forgejo does.
export function toCommits(database: Database, commits: CommitInfo[]): (Commit & { parents: { sha: string }[] })[] {
	const emails = [...new Set(commits.map((c) => c.email.toLowerCase()))];
	const users = emails.length
		? database.query<UserRow, string[]>(`select * from users where email in (${emails.map(() => '?').join(',')}) collate nocase`).all(...emails)
		: [];
	const byEmail = new Map(users.map((u) => [u.email!.toLowerCase(), toUser(u)]));
	return commits.map((c) => ({
		sha: c.sha,
		commit: { message: c.message, author: { name: c.author, date: c.date } },
		author: byEmail.get(c.email.toLowerCase()) ?? null,
		parents: c.parents.map((sha) => ({ sha }))
	}));
}

// Every repo this person can read (their own, their orgs', ones they collaborate on, and public ones), newest first.
export function visibleRepos(userId: number | undefined, origin: string, ownerId?: number) {
	const rows = db
		.query<RepoRow & { o_login: string; o_name: string; o_avatar: string; o_kind: string }, []>(
			`select r.*, u.login as owner, u.login as o_login, u.name as o_name, u.avatar_url as o_avatar from repos r join users u on u.id = r.owner_id order by r.updated_at desc`
		)
		.all()
		.filter((r) => ownerId === undefined || r.owner_id === ownerId);
	return rows
		.map((r) => ({ r, level: access(db, userId, r) }))
		.filter(({ level }) => atLeast(level, 'read'))
		.map(({ r, level }) => toRepo(r, { id: r.owner_id, login: r.o_login, name: r.o_name, avatar_url: r.o_avatar } as UserRow, level, false, origin));
}
