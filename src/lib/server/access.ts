import type { Database } from 'bun:sqlite';
import type { TokenAuth } from './accounts.js';
import type { RepoRow } from './repos.js';

export type Level = 'none' | 'read' | 'write' | 'admin';
const RANK: Record<Level, number> = { none: 0, read: 1, write: 2, admin: 3 };
export const atLeast = (have: Level, need: Level) => RANK[have] >= RANK[need];

// What a person may do to a repo: its owner and site admins administer it, collaborators get their grant, anyone may read a public one.
export function access(db: Database, userId: number | undefined, repo: RepoRow): Level {
	const pub: Level = repo.private ? 'none' : 'read';
	if (!userId) return pub;
	if (repo.owner_id === userId) return 'admin';
	const u = db.query<{ admin: number }, [number]>('select admin from users where id = ?').get(userId);
	if (u?.admin) return 'admin';
	// In an org's repo, the org's owners administer it and its members can write.
	const m = db.query<{ role: string }, [number, number]>('select role from org_members where org_id = ? and user_id = ?').get(repo.owner_id, userId);
	if (m?.role === 'owner') return 'admin';
	const c = db.query<{ permission: Level }, [number, number]>('select permission from collaborators where repo_id = ? and user_id = ?').get(repo.id, userId);
	const levels: Level[] = [c?.permission ?? 'none', m ? 'write' : 'none'];
	const level = levels.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b));
	return RANK[level] > RANK[pub] ? level : pub;
}

// A token can't do more than its scopes and repo list allow, whatever its owner could.
export function tokenAccess(db: Database, t: TokenAuth, repo: RepoRow): Level {
	const level = access(db, t.userId, repo);
	const inScope = t.repos.includes('*') || t.repos.some((r) => r.toLowerCase() === `${repo.owner}/${repo.name}`.toLowerCase());
	const cap: Level = !inScope ? (repo.private ? 'none' : 'read') : t.scopes.includes('repo:write') ? 'admin' : t.scopes.includes('repo:read') ? 'read' : 'none';
	return RANK[level] < RANK[cap] ? level : cap;
}
