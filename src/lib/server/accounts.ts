import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { RESERVED } from '../reserved.js';

export type Claims = { sub: string; email?: string; email_verified?: boolean; preferred_username?: string; name?: string; picture?: string };
export type UserRow = { id: number; login: string; kind: 'user' | 'org' | 'agent'; name: string; email: string | null; avatar_url: string; admin: number };

export const avatar = (u: Pick<UserRow, 'login' | 'avatar_url'>) => u.avatar_url || `/avatars/${encodeURIComponent(u.login)}.svg`;
export const toUser = (u: Pick<UserRow, 'id' | 'login' | 'name' | 'avatar_url'>) => ({ id: u.id, login: u.login, full_name: u.name, avatar_url: avatar(u) });

const MONTH = 30 * 24 * 60 * 60 * 1000;
const hash = (s: string) => new Bun.CryptoHasher('sha256').update(s).digest('hex');
const secret = () => crypto.getRandomValues(new Uint8Array(32)).toBase64({ alphabet: 'base64url', omitPadding: true });

// SHED_ALLOWED_USERS: comma-separated `email:…`, `user:…` (the provider's username) or `sub:…`. An email only counts if the provider
// hasn't said it's unverified, since some providers let people type any address.
export function parseAllowlist(v: string | undefined) {
	const list = (v ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	for (const e of list) if (!/^(email|user|sub):.+/.test(e)) throw new Error(`SHED_ALLOWED_USERS: "${e}" should start with email:, user: or sub:`);
	if (!list.length) throw new Error('SHED_ALLOWED_USERS is empty, so nobody could sign in. Add e.g. user:ada or email:you@example.com');
	return list;
}

export function isAllowed(list: string[], c: Claims) {
	return list.some((e) => {
		const [kind, value] = [e.slice(0, e.indexOf(':')), e.slice(e.indexOf(':') + 1)];
		if (kind === 'sub') return value === c.sub;
		if (kind === 'user') return !!c.preferred_username && value.toLowerCase() === c.preferred_username.toLowerCase();
		return !!c.email && c.email_verified !== false && value.toLowerCase() === c.email.toLowerCase();
	});
}

// The provider's username becomes the login, made URL-safe and unique. Later sign-ins keep the login and refresh name, email and avatar.
// The first person to sign in is the admin.
export function signIn(db: Database, c: Claims) {
	const email = c.email && c.email_verified !== false ? c.email : null;
	// Accounts made by the Forgejo importer have no sub yet; the first allowed sign-in with the same verified email, or failing that
	// the same username, claims one.
	const unclaimed = db.query<UserRow, [string | null, string]>(
		"select * from users where oidc_sub is null and kind = 'user' and ((? is not null and email = ?1) or login = ?2) order by (email = ?1) desc limit 1"
	);
	const claim = db.query<{ id: number }, [string]>('select id from users where oidc_sub = ?').get(c.sub) ? null : unclaimed.get(email, c.preferred_username ?? '');
	if (claim) db.query('update users set oidc_sub = ? where id = ?').run(c.sub, claim.id);
	const existing = db.query<UserRow, [string]>('select * from users where oidc_sub = ?').get(c.sub);
	if (existing) {
		db.query('update users set name = ?, email = coalesce(?, email), avatar_url = ? where id = ?').run(c.name ?? existing.name, email, c.picture ?? '', existing.id);
		return existing.id;
	}
	const base =
		(c.preferred_username ?? c.email?.split('@')[0] ?? 'user')
			.replace(/[^A-Za-z0-9._-]+/g, '-')
			.replace(/^[^A-Za-z0-9]+/, '')
			.replace(/\.git$/i, '')
			.slice(0, 90) || 'user';
	const taken = db.query<{ n: number }, [string]>('select count(*) as n from users where login = ?');
	let login = base;
	for (let i = 2; taken.get(login)!.n || RESERVED.has(login.toLowerCase()); i++) login = `${base}-${i}`;
	const first = db.query<{ n: number }, []>("select count(*) as n from users where kind = 'user'").get()!.n === 0;
	return Number(
		db
			.query('insert into users (login, name, email, oidc_sub, avatar_url, admin) values (?, ?, ?, ?, ?, ?)')
			.run(login, c.name ?? '', email, c.sub, c.picture ?? '', first ? 1 : 0).lastInsertRowid
	);
}

export const getUser = (db: Database, id: number) => db.query<UserRow, [number]>('select * from users where id = ?').get(id);

// Sessions: the cookie holds a random id, the database only its hash.
export function startSession(db: Database, userId: number, ua = '') {
	const id = secret();
	db.query("delete from sessions where created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')").run();
	db.query('insert into sessions (hash, user_id, ua) values (?, ?, ?)').run(hash(id), userId, ua);
	return id;
}

export function sessionUser(db: Database, id: string | undefined) {
	if (!id) return null;
	const s = db.query<{ user_id: number; created_at: string }, [string]>('select user_id, created_at from sessions where hash = ?').get(hash(id));
	if (!s || Date.now() - Date.parse(s.created_at) > MONTH) return null;
	return getUser(db, s.user_id);
}

export const endSession = (db: Database, id: string) => db.query('delete from sessions where hash = ?').run(hash(id));

// Ids are a hash prefix: enough to pick a session without exposing anything usable as the cookie.
export function listSessions(db: Database, userId: number, current?: string) {
	const mine = current && hash(current);
	return db
		.query<{ hash: string; ua: string; created_at: string }, [number]>('select hash, ua, created_at from sessions where user_id = ? order by created_at desc')
		.all(userId)
		.filter((s) => Date.now() - Date.parse(s.created_at) < MONTH)
		.map((s) => ({ id: s.hash.slice(0, 16), ua: s.ua || 'Unknown browser', createdAt: s.created_at, current: s.hash === mine }))
		.sort((a, b) => Number(b.current) - Number(a.current));
}

// Ends one session by id prefix, or every session but the current one when id is omitted.
export function endSessions(db: Database, userId: number, current: string | undefined, id?: string) {
	const keep = current ? hash(current) : '';
	if (id === undefined) db.query('delete from sessions where user_id = ? and hash != ?').run(userId, keep);
	else if (/^[0-9a-f]{16}$/.test(id)) db.query("delete from sessions where user_id = ? and hash != ? and hash like ? || '%'").run(userId, keep, id);
}

// Personal tokens, for git over HTTPS and the API. Shown once; only the hash is kept.
export const SCOPES = ['repo:read', 'repo:write'] as const;
export type Scope = (typeof SCOPES)[number];
export type TokenAuth = { userId: number; tokenId: number; scopes: Scope[]; repos: string[] };

export function createToken(db: Database, userId: number, t: { name: string; scopes: Scope[]; repos?: string[]; expiresAt?: string }) {
	if (!t.name.trim()) error(400, 'Give the token a name');
	if (!t.scopes.length || t.scopes.some((s) => !SCOPES.includes(s))) error(400, `Scopes must be some of ${SCOPES.join(', ')}`);
	const token = `shed_${secret()}`;
	db.query('insert into tokens (user_id, name, hash, scopes, repos, expires_at) values (?, ?, ?, ?, ?, ?)').run(
		userId,
		t.name.trim(),
		hash(token),
		JSON.stringify(t.scopes),
		JSON.stringify(t.repos ?? ['*']),
		t.expiresAt ?? null
	);
	return token;
}

export function tokenAuth(db: Database, token: string): TokenAuth | null {
	// A CI task's token: write access to its own repo while the task runs, acting as whoever triggered the run.
	if (token.startsWith('shedt_')) {
		const t = db
			.query<{ id: number; user_id: number | null; owner_id: number; repo: string }, [string]>(
				"select t.id, r.user_id, rp.owner_id, u.login || '/' || rp.name as repo from tasks t join jobs j on j.id = t.job_id join runs r on r.id = j.run_id join repos rp on rp.id = r.repo_id join users u on u.id = rp.owner_id where t.token_hash = ? and t.status in ('running', 'cancelling')"
			)
			.get(hash(token));
		return t ? { userId: t.user_id ?? t.owner_id, tokenId: -t.id, scopes: ['repo:read', 'repo:write'], repos: [t.repo] } : null;
	}
	if (!token.startsWith('shed_')) return null;
	const t = db.query<{ id: number; user_id: number; scopes: string; repos: string; expires_at: string | null }, [string]>('select * from tokens where hash = ?').get(hash(token));
	if (!t || (t.expires_at && Date.parse(t.expires_at) < Date.now())) return null;
	db.query("update tokens set last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(t.id);
	return { userId: t.user_id, tokenId: t.id, scopes: JSON.parse(t.scopes), repos: JSON.parse(t.repos) };
}
