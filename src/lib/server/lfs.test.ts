import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { createToken, signIn } from './accounts.js';
import { openDb } from './db.js';
import { isLfsRequest, lfs, lfsPointer } from './lfs.js';
import { createRepo } from './repos.js';

let root: string, db: Database, auth: string, readOnly: string;
const call = (path: string, init: RequestInit = {}, token = auth) => {
	const req = new Request(`http://shed${path}`, { ...init, headers: { authorization: `Basic ${btoa(`x:${token}`)}`, 'content-type': 'application/vnd.git-lfs+json', ...init.headers } });
	return lfs(db, root, req, new URL(req.url));
};
const data = new TextEncoder().encode('large file contents');
const oid = new Bun.CryptoHasher('sha256').update(data).digest('hex');

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-lfs-`);
	db = openDb(':memory:');
	const ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	await createRepo(db, root, ada, { name: 'big' });
	auth = createToken(db, ada, { name: 'w', scopes: ['repo:read', 'repo:write'] });
	readOnly = createToken(db, ada, { name: 'r', scopes: ['repo:read'] });
});
afterAll(() => rm(root, { recursive: true }));

test('routes', () => {
	expect(isLfsRequest(new URL('http://x/ada/big.git/info/lfs/objects/batch'))).toBe(true);
	expect(isLfsRequest(new URL('http://x/ada/big/info/lfs/locks/verify'))).toBe(true);
	expect(isLfsRequest(new URL('http://x/ada/big.git/info/refs'))).toBe(false);
});

test('upload, verify, download; content must match its oid; read tokens can only download', async () => {
	const batch = (operation: string, token = auth) => call('/ada/big.git/info/lfs/objects/batch', { method: 'POST', body: JSON.stringify({ operation, objects: [{ oid, size: data.length }] }) }, token);
	expect((await (await batch('download')).json()).objects[0].error.code).toBe(404);
	expect((await batch('upload', readOnly)).status).toBe(403);
	const up = (await (await batch('upload')).json()).objects[0];
	expect(up.actions.upload.href).toEndWith(`/objects/${oid}`);
	expect((await call(`/ada/big.git/info/lfs/objects/${oid}`, { method: 'PUT', body: 'wrong' })).status).toBe(422);
	expect((await call(`/ada/big.git/info/lfs/objects/${oid}`, { method: 'PUT', body: data })).status).toBe(200);
	expect((await call('/ada/big.git/info/lfs/verify', { method: 'POST', body: JSON.stringify({ oid, size: data.length }) })).status).toBe(200);
	expect((await (await batch('upload')).json()).objects[0].actions).toBeUndefined();
	expect(await (await call(`/ada/big.git/info/lfs/objects/${oid}`, {}, readOnly)).text()).toBe('large file contents');
	expect(lfsPointer(new TextEncoder().encode(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${data.length}\n`))).toEqual({ oid, size: data.length });
	expect(lfsPointer(new TextEncoder().encode('hello'))).toBeNull();
});
