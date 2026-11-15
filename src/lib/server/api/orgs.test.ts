import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn, type TokenAuth } from '../accounts.js';
import { sniff } from '../avatars.js';
import { openDb } from '../db.js';
import { createRepo } from '../repos.js';
import { dispatch } from './router.js';
import './repos.js';

let root: string, db: Database, ada: number, ana: number, bob: number;

const call = async (user: number, method: string, path: string, body?: unknown, token: TokenAuth | null = null) => {
	const res = await dispatch(db, root, 'https://shed.test', new Request(`http://shed/api/v1${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), {
		user: getUser(db, user)!,
		token
	});
	return { status: res.status, json: res.status === 204 ? null : await res.json() };
};
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-orgs-`);
	db = openDb(':memory:');
	ada = signIn(db, { sub: '1', preferred_username: 'ada' }); // site admin, being first
	ana = signIn(db, { sub: '2', preferred_username: 'ana' });
	bob = signIn(db, { sub: '3', preferred_username: 'bob' });
});
afterAll(() => rm(root, { recursive: true }));

test('anyone signed in can make an org under a free, valid name and owns it', async () => {
	expect((await call(ana, 'POST', '/orgs', { username: 'settings' })).status).toBe(422);
	expect((await call(ana, 'POST', '/orgs', { username: '../x' })).status).toBe(400);
	expect((await call(ana, 'POST', '/orgs', { username: 'BOB' })).status).toBe(409);
	expect((await call(ana, 'POST', '/orgs', { username: 'kiwi', website: 'javascript:alert(1)' })).status).toBe(422);
	const made = await call(ana, 'POST', '/orgs', { username: 'kiwi', full_name: 'Kiwi Co', website: 'kiwi.nz' });
	expect(made.status).toBe(201);
	expect(made.json).toMatchObject({ username: 'kiwi', full_name: 'Kiwi Co', website: 'https://kiwi.nz' });
	expect((await call(ana, 'GET', '/orgs/kiwi/members')).json).toMatchObject([{ login: 'ana', role: 'owner' }]);
	const readOnly = { userId: bob, tokenId: 1, scopes: ['repo:read'], repos: ['*'] } satisfies TokenAuth;
	expect((await call(bob, 'POST', '/orgs', { username: 'nope' }, readOnly)).status).toBe(403);
});

test('only owners edit an org and its members; it always keeps an owner', async () => {
	expect((await call(bob, 'PATCH', '/orgs/kiwi', { description: 'x' })).status).toBe(403);
	expect((await call(ana, 'PATCH', '/orgs/kiwi', { description: 'Birds' })).json).toMatchObject({ description: 'Birds' });
	expect((await call(ana, 'PUT', '/orgs/kiwi/members/bob', { role: 'member' })).json).toMatchObject({ login: 'bob', role: 'member' });
	expect((await call(bob, 'GET', '/orgs/kiwi/members/bob')).status).toBe(204);
	expect((await call(bob, 'PUT', '/orgs/kiwi/members/bob', { role: 'owner' })).status).toBe(403);
	expect((await call(ana, 'PUT', '/orgs/kiwi/members/ana', { role: 'member' })).status).toBe(422);
	expect((await call(ana, 'DELETE', '/orgs/kiwi/members/ana')).status).toBe(422);
	expect((await call(ana, 'PUT', '/orgs/kiwi/members/bob', { role: 'owner' })).status).toBe(200);
	expect((await call(ana, 'PUT', '/orgs/kiwi/members/ana', { role: 'member' })).status).toBe(200);
	// Members may leave; they can't remove others.
	expect((await call(ana, 'DELETE', '/orgs/kiwi/members/bob')).status).toBe(403);
	expect((await call(ana, 'DELETE', '/orgs/kiwi/members/ana')).status).toBe(204);
	expect((await call(bob, 'GET', '/orgs/kiwi/members/ana')).status).toBe(404);
	expect((await call(bob, 'PUT', '/orgs/kiwi/members/ana', {})).status).toBe(200);
});

test('transfer: admin on the repo, owner of the destination, no name clash', async () => {
	await createRepo(db, root, ana, { name: 'app' });
	await createRepo(db, root, bob, { name: 'app' });
	expect((await call(bob, 'POST', '/repos/ana/app/transfer', { new_owner: 'bob' })).status).toBe(404);
	expect((await call(ana, 'POST', '/repos/ana/app/transfer', { new_owner: 'bob' })).status).toBe(403);
	// ana is a plain member of kiwi now.
	expect((await call(ana, 'POST', '/repos/ana/app/transfer', { new_owner: 'kiwi' })).status).toBe(403);
	expect((await call(bob, 'POST', '/repos/bob/app/transfer', { new_owner: 'kiwi' })).status).toBe(202);
	expect((await call(bob, 'GET', '/repos/kiwi/app')).json).toMatchObject({ full_name: 'kiwi/app' });
	await call(bob, 'PUT', '/orgs/kiwi/members/ana', { role: 'owner' });
	expect((await call(ana, 'POST', '/repos/ana/app/transfer', { new_owner: 'kiwi' })).status).toBe(409);
	expect((await call(ana, 'POST', '/repos/kiwi/app/transfer', { new_owner: 'kiwi' })).status).toBe(422);
});

test('an org with repos cannot be deleted', async () => {
	expect((await call(ana, 'DELETE', '/orgs/kiwi')).status).toBe(409);
	expect((await call(ana, 'POST', '/repos/kiwi/app/transfer', { new_owner: 'ana' })).status).toBe(409);
	await call(ada, 'DELETE', '/repos/kiwi/app');
	expect((await call(ana, 'DELETE', '/orgs/kiwi')).status).toBe(204);
	expect((await call(ana, 'GET', '/orgs/kiwi')).status).toBe(404);
	expect(db.query('select count(*) as n from org_members').get()).toEqual({ n: 0 });
});

test('profile settings and avatars', async () => {
	expect((await call(bob, 'PATCH', '/user/settings', { full_name: ' Bob ', location: 'Wellington', website: '' })).json).toMatchObject({ full_name: 'Bob', location: 'Wellington', website: '' });
	expect((await call(bob, 'GET', '/user/settings')).json).toMatchObject({ full_name: 'Bob' });
	expect((await call(bob, 'POST', '/user/avatar', { image: btoa('<svg onload=alert(1)>') })).status).toBe(422);
	expect((await call(bob, 'POST', '/user/avatar', { image: new Uint8Array(1024 * 1024 + 1).toBase64() })).status).toBe(413);
	expect((await call(bob, 'POST', '/user/avatar', { image: PNG.toBase64() })).status).toBe(204);
	expect((await call(bob, 'GET', '/users/bob')).json.avatar_url).toMatch(/^\/avatars\/\d+\.img\?v=/);
	expect(await Bun.file(`${root}/avatars/${bob}`).exists()).toBe(true);
	expect((await call(bob, 'DELETE', '/user/avatar')).status).toBe(204);
	expect((await call(bob, 'GET', '/users/bob')).json.avatar_url).toBe('/avatars/bob.svg');
});

test('sniffing', () => {
	expect(sniff(PNG)).toBe('image/png');
	expect(sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
	expect(sniff(new TextEncoder().encode('GIF89a...'))).toBe('image/gif');
	expect(sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
	expect(sniff(new TextEncoder().encode('<svg/>'))).toBeNull();
});
