import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { RESERVED } from '../reserved.js';
import type { UserRow } from './accounts.js';
import { checkName, getRepo, repoMoved, type RepoRow } from './repos.js';

export type Profile = { full_name?: unknown; description?: unknown; website?: unknown; location?: unknown };
export type Role = 'owner' | 'member';

// Profile fields as columns. The website goes in an href, so only http(s) links; a bare host gets https://.
export function profileColumns(p: Profile) {
	const set: Record<string, string> = {};
	const text = (v: unknown, max: number) => String(v).trim().slice(0, max);
	if (typeof p.full_name === 'string') set.name = text(p.full_name, 100);
	if (typeof p.description === 'string') set.description = text(p.description, 255);
	if (typeof p.location === 'string') set.location = text(p.location, 50);
	if (typeof p.website === 'string') {
		let w = text(p.website, 255);
		if (w && !/^[a-z][a-z0-9+.-]*:/i.test(w)) w = `https://${w}`;
		const u = w ? URL.parse(w) : null;
		if (w && (!u || !['http:', 'https:'].includes(u.protocol) || !u.hostname)) error(422, 'Website has to be an http(s) link');
		set.website = w;
	}
	return set;
}

export function updateProfile(db: Database, userId: number, p: Profile) {
	for (const [k, v] of Object.entries(profileColumns(p))) db.query(`update users set ${k} = ? where id = ?`).run(v, userId);
}

export const getOrg = (db: Database, login: string) => db.query<UserRow, [string]>("select * from users where login = ? and kind = 'org'").get(login);

export const roleIn = (db: Database, orgId: number, userId: number) =>
	db.query<{ role: Role }, [number, number]>('select role from org_members where org_id = ? and user_id = ?').get(orgId, userId)?.role ?? null;

// Site admins may run any org, as they may administer any repo.
export const ownsOrg = (db: Database, orgId: number, user: Pick<UserRow, 'id' | 'admin'>) => !!user.admin || roleIn(db, orgId, user.id) === 'owner';

// Any signed-in person may make an org, under a name no account has and no page uses; they become its owner.
export function createOrg(db: Database, userId: number, b: Profile & { username?: unknown }) {
	const login = checkName(String(b.username ?? '').trim(), 'Organization name');
	if (RESERVED.has(login.toLowerCase())) error(422, `${login} is reserved`);
	const cols = profileColumns(b);
	return db.transaction(() => {
		if (db.query('select 1 from users where login = ?').get(login)) error(409, `The name ${login} is taken`);
		const id = Number(db.query("insert into users (login, kind) values (?, 'org')").run(login).lastInsertRowid);
		for (const [k, v] of Object.entries(cols)) db.query(`update users set ${k} = ? where id = ?`).run(v, id);
		db.query("insert into org_members (org_id, user_id, role) values (?, ?, 'owner')").run(id, userId);
		return id;
	})();
}

const otherOwners = (db: Database, orgId: number, userId: number) =>
	db.query<{ n: number }, [number, number]>("select count(*) as n from org_members where org_id = ? and role = 'owner' and user_id != ?").get(orgId, userId)!.n;

// Adds someone or changes their role. An org always keeps an owner.
export function setMember(db: Database, orgId: number, userId: number, role: Role) {
	if (role !== 'owner' && role !== 'member') error(422, 'Role is owner or member');
	const u = db.query<{ kind: string }, [number]>('select kind from users where id = ?').get(userId);
	if (u?.kind !== 'user') error(422, 'Only people can be members');
	if (role === 'member' && roleIn(db, orgId, userId) === 'owner' && !otherOwners(db, orgId, userId)) error(422, 'An organization needs at least one owner');
	db.query('insert into org_members (org_id, user_id, role) values (?, ?, ?) on conflict (org_id, user_id) do update set role = excluded.role').run(orgId, userId, role);
}

export function removeMember(db: Database, orgId: number, userId: number) {
	const role = roleIn(db, orgId, userId);
	if (!role) error(404, 'Not a member');
	if (role === 'owner' && !otherOwners(db, orgId, userId)) error(422, 'An organization needs at least one owner');
	db.query('delete from org_members where org_id = ? and user_id = ?').run(orgId, userId);
}

// Only an empty org can go, so no repo is ever deleted by accident with it.
export function deleteOrg(db: Database, orgId: number) {
	const n = db.query<{ n: number }, [number]>('select count(*) as n from repos where owner_id = ?').get(orgId)!.n;
	if (n) error(409, `Transfer or delete its ${n} repositor${n === 1 ? 'y' : 'ies'} first`);
	db.query("delete from users where id = ? and kind = 'org'").run(orgId);
}

// Repos are stored by id, so a transfer is only a new owner_id.
export async function transferRepo(db: Database, repo: RepoRow, to: Pick<UserRow, 'id' | 'login' | 'kind'>) {
	if (to.kind === 'agent') error(422, "Agents can't own repositories");
	if (to.id === repo.owner_id) error(422, `${repo.owner}/${repo.name} already belongs to ${to.login}`);
	if (getRepo(db, to.login, repo.name)) error(409, `${to.login} already has a repository called ${repo.name}`);
	db.query("update repos set owner_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(to.id, repo.id);
	// The new owner administers it anyway; a leftover grant would only show up in the collaborator list.
	db.query('delete from collaborators where repo_id = ? and user_id = ?').run(repo.id, to.id);
	await repoMoved(db, `${repo.owner}/${repo.name}`, `${to.login}/${repo.name}`);
}
