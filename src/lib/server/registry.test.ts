import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { createToken, signIn } from './accounts.js';
import { openDb } from './db.js';
import { genericPackage, registry } from './registry.js';

let root: string, db: Database, ada: string, other: string;
const req = (path: string, init: RequestInit = {}, token: string | null = ada) => {
	const r = new Request(`http://shed${path}`, { ...init, headers: { ...(token && { authorization: `Basic ${btoa(`x:${token}`)}` }), ...init.headers } });
	return path.startsWith('/v2') ? registry(db, root, r, new URL(r.url)) : genericPackage(db, root, r, new URL(r.url));
};
const sha = (b: Uint8Array | string) => `sha256:${new Bun.CryptoHasher('sha256').update(b).digest('hex')}`;

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-reg-`);
	db = openDb(':memory:');
	ada = createToken(db, signIn(db, { sub: '1', preferred_username: 'ada' }), { name: 'w', scopes: ['repo:read', 'repo:write'] });
	other = createToken(db, signIn(db, { sub: '2', preferred_username: 'other' }), { name: 'w', scopes: ['repo:read', 'repo:write'] });
});
afterAll(() => rm(root, { recursive: true }));

test('push an image, pull it, and keep strangers out', async () => {
	expect((await req('/v2/', {}, null)).status).toBe(401);
	expect((await req('/v2/')).status).toBe(200);
	const layer = 'layer bytes', config = '{"architecture":"amd64"}';
	for (const blob of [layer, config]) {
		const start = await req('/v2/ada/app/blobs/uploads/', { method: 'POST' });
		expect(start.status).toBe(202);
		const loc = start.headers.get('location')!;
		expect((await req(loc, { method: 'PATCH', body: blob })).status).toBe(202);
		expect((await req(`${loc}?digest=${sha(blob)}`, { method: 'PUT' })).status).toBe(201);
	}
	const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: sha(config) }, layers: [{ digest: sha(layer) }] });
	expect((await req('/v2/ada/app/manifests/v1', { method: 'PUT', body: manifest, headers: { 'content-type': 'application/vnd.oci.image.manifest.v1+json' } })).status).toBe(201);
	const got = await req('/v2/ada/app/manifests/v1');
	expect(got.headers.get('docker-content-digest')).toBe(sha(manifest));
	expect(await got.text()).toBe(manifest);
	expect(await (await req(`/v2/ada/app/blobs/${sha(layer)}`)).text()).toBe(layer);
	expect(await (await req('/v2/ada/app/tags/list')).json()).toEqual({ name: 'ada/app', tags: ['v1'] });
	expect((await req('/v2/ada/app/manifests/v1', {}, other)).status).toBe(403);
	expect((await req('/v2/ada/app/blobs/uploads/', { method: 'POST' }, other)).status).toBe(403);
	// A wrong digest is refused; a manifest can't point at blobs that aren't here.
	const loc = (await req('/v2/ada/app/blobs/uploads/', { method: 'POST' })).headers.get('location')!;
	expect((await req(`${loc}?digest=${sha('x')}`, { method: 'PUT', body: 'y' })).status).toBe(400);
	expect((await req('/v2/ada/app/manifests/v2', { method: 'PUT', body: JSON.stringify({ layers: [{ digest: sha('missing') }] }) })).status).toBe(400);
});

test('generic packages', async () => {
	expect((await req('/api/packages/ada/generic/tool/1.0.0/tool.txt', { method: 'PUT', body: 'tool' })).status).toBe(201);
	expect((await req('/api/packages/ada/generic/tool/1.0.0/tool.txt', { method: 'PUT', body: 'again' })).status).toBe(409);
	expect(await (await req('/api/packages/ada/generic/tool/1.0.0/tool.txt')).text()).toBe('tool');
	expect((await req('/api/packages/ada/generic/tool/1.0.0/tool.txt', {}, other)).status).toBe(404);
	expect((await req('/api/packages/ada/generic/tool/1.0.0/tool.txt', { method: 'PUT', body: 'x' }, other)).status).toBe(403);
});
