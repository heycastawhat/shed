import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { tokenAuth } from './accounts.js';
import { atLeast, tokenAccess, type Level } from './access.js';
import { getRepo } from './repos.js';

// Git LFS (the batch API with the basic transfer adapter, plus locks) at <repo>.git/info/lfs/…, authenticated like git over HTTPS
// (a Shed token as the Basic password). Objects are stored once by oid under SHED_DATA/lfs; a repo may only read objects it was given.

const ROUTE = /^\/([^/]+)\/([^/]+?)(?:\.git)?\/info\/lfs\/(objects\/batch|objects\/[0-9a-f]{64}|verify|locks(?:\/verify|\/\d+\/unlock)?)$/;
export const isLfsRequest = (url: URL) => ROUTE.test(url.pathname);
export const lfsPath = (root: string, oid: string) => `${root}/lfs/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;

const TYPE = 'application/vnd.git-lfs+json';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': TYPE } });
const fail = (status: number, message: string, auth = false) =>
	new Response(JSON.stringify({ message }), { status, headers: { 'content-type': TYPE, ...(auth && { 'lfs-authenticate': 'Basic realm="Shed"', 'www-authenticate': 'Basic realm="Shed"' }) } });

export async function lfs(db: Database, root: string, request: Request, url: URL) {
	const [, owner, name, action] = url.pathname.match(ROUTE)!;
	const basic = request.headers.get('authorization')?.match(/^Basic\s+(.+)$/i)?.[1];
	const password = basic ? new TextDecoder().decode(Uint8Array.fromBase64(basic)).split(':').slice(1).join(':') : undefined;
	const token = password ? tokenAuth(db, password) : null;
	const repo = getRepo(db, owner, name);
	const level: Level = repo ? (token ? tokenAccess(db, token, repo) : repo.private ? 'none' : 'read') : 'none';
	if (!repo || !atLeast(level, 'read')) return token ? fail(404, 'Repository not found') : fail(401, 'Sign in with a Shed token as the password', true);
	const need = async (l: Level) => {
		if (!atLeast(level, l)) return token ? fail(403, `You need ${l} access to ${owner}/${name}`) : fail(401, 'Sign in to push', true);
		if (l !== 'read' && (repo.archived || repo.mirror_url)) return fail(403, `${owner}/${name} can't be written to`);
		return null;
	};
	const has = (oid: string) => !!db.query('select 1 from lfs_objects where repo_id = ? and oid = ?').get(repo.id, oid);
	const base = `${url.origin}/${owner}/${name}.git/info/lfs`;
	// The object links reuse the request's own credentials.
	const header = request.headers.get('authorization') ? { Authorization: request.headers.get('authorization')! } : undefined;

	if (action === 'objects/batch') {
		const b = (await request.json().catch(() => ({}))) as { operation?: string; objects?: { oid: string; size: number }[] };
		const upload = b.operation === 'upload';
		const denied = await need(upload ? 'write' : 'read');
		if (denied) return denied;
		const objects = (b.objects ?? []).map(({ oid, size }) => {
			if (!/^[0-9a-f]{64}$/.test(oid) || !Number.isInteger(size) || size < 0) return { oid, size, error: { code: 422, message: 'Invalid object' } };
			if (upload)
				return has(oid)
					? { oid, size }
					: { oid, size, authenticated: true, actions: { upload: { href: `${base}/objects/${oid}`, header, expires_in: 3600 }, verify: { href: `${base}/verify`, header, expires_in: 3600 } } };
			return has(oid) ? { oid, size, authenticated: true, actions: { download: { href: `${base}/objects/${oid}`, header, expires_in: 3600 } } } : { oid, size, error: { code: 404, message: 'Object not found' } };
		});
		return json({ transfer: 'basic', objects, hash_algo: 'sha256' });
	}

	if (action.startsWith('objects/')) {
		const oid = action.slice('objects/'.length);
		if (request.method === 'GET') {
			const denied = await need('read');
			if (denied) return denied;
			if (!has(oid) || !existsSync(lfsPath(root, oid))) return fail(404, 'Object not found');
			return new Response(Bun.file(lfsPath(root, oid)), { headers: { 'content-type': 'application/octet-stream' } });
		}
		if (request.method !== 'PUT') return fail(405, 'Method not allowed');
		const denied = await need('write');
		if (denied) return denied;
		// Stream to a temp file while hashing, and keep it only if the content matches its oid.
		const tmp = `${tmpdir()}/shed-lfs-${crypto.randomUUID()}`;
		const hasher = new Bun.CryptoHasher('sha256');
		const writer = Bun.file(tmp).writer();
		let size = 0;
		for await (const chunk of request.body ?? new ReadableStream()) {
			hasher.update(chunk);
			writer.write(chunk);
			size += chunk.length;
		}
		await writer.end();
		if (hasher.digest('hex') !== oid) {
			await rm(tmp, { force: true });
			return fail(422, "The content doesn't match its oid");
		}
		await mkdir(lfsPath(root, oid).replace(/\/[^/]+$/, ''), { recursive: true });
		await rename(tmp, lfsPath(root, oid)).catch(async () => {
			await Bun.write(lfsPath(root, oid), Bun.file(tmp));
			await rm(tmp, { force: true });
		});
		db.query('insert or ignore into lfs_objects (repo_id, oid, size) values (?, ?, ?)').run(repo.id, oid, size);
		return new Response(null, { status: 200 });
	}

	if (action === 'verify') {
		const b = (await request.json().catch(() => ({}))) as { oid?: string; size?: number };
		const row = db.query<{ size: number }, [number, string]>('select size from lfs_objects where repo_id = ? and oid = ?').get(repo.id, String(b.oid));
		return row && row.size === b.size ? json({}) : fail(404, 'Object not found');
	}

	// Locks.
	type Lock = { id: number; path: string; user_id: number; created_at: string; login: string };
	const lockJson = (l: Lock) => ({ id: String(l.id), path: l.path, locked_at: l.created_at, owner: { name: l.login } });
	const locks = () => db.query<Lock, [number]>('select l.*, u.login from lfs_locks l join users u on u.id = l.user_id where l.repo_id = ? order by l.id').all(repo.id);
	if (action === 'locks' && request.method === 'GET') {
		const path = url.searchParams.get('path');
		const id = url.searchParams.get('id');
		return json({ locks: locks().filter((l) => (!path || l.path === path) && (!id || String(l.id) === id)).map(lockJson) });
	}
	const denied = await need('write');
	if (denied) return denied;
	if (action === 'locks/verify') {
		const all = locks();
		return json({ ours: all.filter((l) => l.user_id === token!.userId).map(lockJson), theirs: all.filter((l) => l.user_id !== token!.userId).map(lockJson) });
	}
	if (action === 'locks') {
		const { path } = (await request.json().catch(() => ({}))) as { path?: string };
		if (!path) return fail(422, 'A lock needs a path');
		const existing = locks().find((l) => l.path === path);
		if (existing) return json({ lock: lockJson(existing), message: 'Already locked' }, 409);
		db.query('insert into lfs_locks (repo_id, path, user_id) values (?, ?, ?)').run(repo.id, path, token!.userId);
		return json({ lock: lockJson(locks().find((l) => l.path === path)!) }, 201);
	}
	const lockId = Number(action.split('/')[1]);
	const l = locks().find((x) => x.id === lockId);
	if (!l) return fail(404, 'Lock not found');
	const { force } = (await request.json().catch(() => ({}))) as { force?: boolean };
	if (l.user_id !== token!.userId && !(force && level === 'admin')) return fail(403, `${l.login} holds this lock`);
	db.query('delete from lfs_locks where id = ?').run(l.id);
	return json({ lock: lockJson(l) });
}

// A blob that's an LFS pointer: its oid and size.
export function lfsPointer(bytes: Uint8Array) {
	if (bytes.length > 300) return null;
	const m = new TextDecoder().decode(bytes).match(/^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)\n?/);
	return m ? { oid: m[1], size: Number(m[2]) } : null;
}
