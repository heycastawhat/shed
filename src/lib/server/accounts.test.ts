import { beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openDb } from './db.js';
import { createToken, endSessions, isAllowed, listSessions, parseAllowlist, sessionUser, signIn, startSession, tokenAuth } from './accounts.js';

let db: Database;
beforeEach(() => (db = openDb(':memory:')));

test('the allowlist must be typed and non-empty', () => {
	expect(() => parseAllowlist('')).toThrow(/nobody could sign in/);
	expect(() => parseAllowlist('ada')).toThrow(/email:, user: or sub:/);
	expect(parseAllowlist(' user:ada , email:a@b.nz ')).toEqual(['user:ada', 'email:a@b.nz']);
});

test('allowlist matching', () => {
	const list = ['user:Ada', 'email:me@x.nz', 'sub:abc'];
	expect(isAllowed(list, { sub: '1', preferred_username: 'ada' })).toBe(true);
	expect(isAllowed(list, { sub: '1', email: 'ME@x.nz' })).toBe(true);
	expect(isAllowed(list, { sub: '1', email: 'me@x.nz', email_verified: false })).toBe(false);
	expect(isAllowed(list, { sub: 'abc' })).toBe(true);
	expect(isAllowed(list, { sub: 'abcd', preferred_username: 'ada2' })).toBe(false);
});

test('first sign-in makes an admin; later ones keep the login and name', () => {
	const id = signIn(db, { sub: 's1', preferred_username: 'ada', name: 'Ada', email: 'j@x.nz', picture: 'https://p/1' });
	expect(db.query('select login, name, email, admin, avatar_url from users where id = ?').get(id)).toEqual({ login: 'ada', name: 'Ada', email: 'j@x.nz', admin: 1, avatar_url: 'https://p/1' });
	expect(signIn(db, { sub: 's1', preferred_username: 'renamed', name: 'Ada P' })).toBe(id);
	expect(db.query('select login, name, email from users where id = ?').get(id)).toEqual({ login: 'ada', name: 'Ada', email: 'j@x.nz' });
	const other = signIn(db, { sub: 's2', preferred_username: 'ADA' });
	expect(db.query('select login, admin from users where id = ?').get(other)).toEqual({ login: 'ADA-2', admin: 0 });
	expect(db.query('select login from users where id = ?').get(signIn(db, { sub: 's3', preferred_username: '../evil name.git' }))).toEqual({ login: 'evil-name' });
});

test('a name or avatar set in Shed survives sign-in; the provider fills empty ones', () => {
	const id = signIn(db, { sub: 's1', preferred_username: 'ada', picture: 'https://p/1' });
	expect(db.query('select name, avatar_url from users where id = ?').get(id)).toEqual({ name: '', avatar_url: 'https://p/1' });
	signIn(db, { sub: 's1', name: 'Ada', picture: 'https://p/2' });
	expect(db.query('select name, avatar_url from users where id = ?').get(id)).toEqual({ name: 'Ada', avatar_url: 'https://p/2' });
	db.query("update users set name = 'J', avatar_url = '/avatars/1.img?v=1' where id = ?").run(id);
	signIn(db, { sub: 's1', name: 'Ada', picture: 'https://p/3' });
	expect(db.query('select name, avatar_url from users where id = ?').get(id)).toEqual({ name: 'J', avatar_url: '/avatars/1.img?v=1' });
});

test('sessions', () => {
	const ada = signIn(db, { sub: 's1', preferred_username: 'ada' });
	const a = startSession(db, ada, 'Firefox on Linux');
	const b = startSession(db, ada, 'Chrome on Android');
	expect(sessionUser(db, a)?.login).toBe('ada');
	expect(sessionUser(db, 'nope')).toBeNull();
	expect(sessionUser(db, undefined)).toBeNull();
	const list = listSessions(db, ada, a);
	expect(list.map((s) => [s.ua, s.current])).toEqual([
		['Firefox on Linux', true],
		['Chrome on Android', false]
	]);
	endSessions(db, ada, a, list[1].id);
	expect(sessionUser(db, b)).toBeNull();
	expect(sessionUser(db, a)).not.toBeNull();
	db.run("update sessions set created_at = '2000-01-01T00:00:00Z'");
	expect(sessionUser(db, a)).toBeNull();
});

test('tokens', () => {
	const ada = signIn(db, { sub: 's1', preferred_username: 'ada' });
	const t = createToken(db, ada, { name: 'laptop', scopes: ['repo:read', 'repo:write'] });
	expect(t).toStartWith('shed_');
	expect(tokenAuth(db, t)).toMatchObject({ userId: ada, scopes: ['repo:read', 'repo:write'], repos: ['*'] });
	expect(db.query('select last_used_at from tokens').get()).not.toEqual({ last_used_at: null });
	expect(tokenAuth(db, t + 'x')).toBeNull();
	expect(tokenAuth(db, 'other')).toBeNull();
	const old = createToken(db, ada, { name: 'old', scopes: ['repo:read'], expiresAt: '2001-01-01T00:00:00Z' });
	expect(tokenAuth(db, old)).toBeNull();
	expect(() => createToken(db, ada, { name: ' ', scopes: ['repo:read'] })).toThrow();
	expect(() => createToken(db, ada, { name: 'x', scopes: ['admin' as 'repo:read'] })).toThrow();
});

test('a sign-in claims an imported account by email, else by username', () => {
	const a = Number(db.query("insert into users (login, email) values ('ada', 'j@x.nz')").run().lastInsertRowid);
	const b = Number(db.query("insert into users (login) values ('kim')").run().lastInsertRowid);
	db.query("insert into users (login, kind) values ('kiwi', 'org')").run();
	expect(signIn(db, { sub: 's1', preferred_username: 'adaua', email: 'j@x.nz' })).toBe(a);
	expect(signIn(db, { sub: 's2', preferred_username: 'kim' })).toBe(b);
	expect(db.query("select login from users where id = ?").get(signIn(db, { sub: 's3', preferred_username: 'kiwi' }))).toEqual({ login: 'kiwi-2' });
	expect(signIn(db, { sub: 's1', preferred_username: 'adaua' })).toBe(a);
});
