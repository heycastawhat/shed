import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { getUser, tokenAuth, type UserRow } from './accounts.js';

// A container registry (the OCI distribution API at /v2/) so `docker login/push/pull <shed host>/<owner>/<image>` work. Images belong
// to a user or org: its members can push, and pulls need membership unless the package is public. Auth is Basic with a Shed token.

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const NAME = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
export const blobPath = (root: string, digest: string) => `${root}/packages/blobs/${digest.slice(7, 9)}/${digest.slice(7)}`;
const uploadPath = (root: string, id: string) => `${root}/packages/uploads/${id}`;

type Pkg = { id: number; owner_id: number; private: number; name: string };

const err = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
	new Response(JSON.stringify({ errors: [{ code, message }] }), { status, headers: { 'content-type': 'application/json', 'docker-distribution-api-version': 'registry/2.0', ...extra } });
const challenge = { 'www-authenticate': 'Basic realm="Shed"' };

function authUser(db: Database, request: Request) {
	const basic = request.headers.get('authorization')?.match(/^Basic\s+(.+)$/i)?.[1];
	if (!basic) return null;
	const pass = new TextDecoder().decode(Uint8Array.fromBase64(basic)).split(':').slice(1).join(':');
	const t = tokenAuth(db, pass);
	return t ? { user: getUser(db, t.userId)!, write: t.scopes.includes('repo:write') } : undefined;
}

const member = (db: Database, ownerId: number, userId: number) =>
	ownerId === userId || !!db.query('select 1 from org_members where org_id = ? and user_id = ?').get(ownerId, userId) || !!db.query('select admin from users where id = ? and admin = 1').get(userId);

export async function registry(db: Database, root: string, request: Request, url: URL) {
	const headers = { 'docker-distribution-api-version': 'registry/2.0' };
	const who = authUser(db, request);
	if (who === undefined) return err(401, 'UNAUTHORIZED', 'That token is unknown or expired', challenge);
	const path = url.pathname.replace(/^\/v2\/?/, '');
	if (path === '') return who ? new Response('{}', { headers: { ...headers, 'content-type': 'application/json' } }) : err(401, 'UNAUTHORIZED', 'Sign in with a Shed token', challenge);
	if (path === '_catalog') {
		if (!who) return err(401, 'UNAUTHORIZED', 'Sign in', challenge);
		const names = db
			.query<{ login: string; name: string; owner_id: number; private: number }, []>("select u.login, p.name, p.owner_id, p.private from packages p join users u on u.id = p.owner_id where p.type = 'container' order by 1, 2")
			.all()
			.filter((p) => !p.private || member(db, p.owner_id, who.user.id))
			.map((p) => `${p.login}/${p.name}`);
		return Response.json({ repositories: names }, { headers });
	}
	const m = path.match(/^(.+?)\/(blobs\/uploads\/?(.*)|blobs\/([^/]+)|manifests\/([^/]+)|tags\/list)$/);
	if (!m) return err(404, 'NAME_UNKNOWN', 'Not a registry path');
	const [owner, ...rest] = m[1].split('/');
	const image = rest.join('/');
	if (!image || !NAME.test(image)) return err(400, 'NAME_INVALID', 'Image names are lowercase letters, digits and . _ - /');
	const ownerRow = db.query<UserRow, [string]>("select * from users where login = ? and kind != 'agent'").get(owner);
	if (!ownerRow) return err(404, 'NAME_UNKNOWN', `No user or organization called ${owner}`);
	const pkg = db.query<Pkg, [number, string]>("select * from packages where owner_id = ? and type = 'container' and name = ?").get(ownerRow.id, image);
	const canWrite = !!who && who.write && member(db, ownerRow.id, who.user.id);
	const canRead = canWrite || (!!who && member(db, ownerRow.id, who.user.id)) || (!!pkg && !pkg.private);
	const writing = request.method !== 'GET' && request.method !== 'HEAD';
	if (writing ? !canWrite : !canRead) return who ? err(403, 'DENIED', `You can't ${writing ? 'push to' : 'pull'} ${owner}/${image}`) : err(401, 'UNAUTHORIZED', 'Sign in', challenge);
	const ensure = () =>
		pkg ?? db.query<Pkg, [number, string]>("insert into packages (owner_id, type, name) values (?, 'container', ?) returning *").get(ownerRow.id, image)!;
	const ownBlob = (digest: string) => db.query<{ size: number; media_type: string }, [number, string]>('select size, media_type from package_blobs where owner_id = ? and digest = ?').get(ownerRow.id, digest);
	const base = `/v2/${owner}/${image}`;

	// Blob uploads: start (optionally whole, or mounted from another of this owner's images), append chunks, finish with the digest.
	if (m[2].startsWith('blobs/uploads')) {
		const id = m[3];
		if (!id && request.method === 'POST') {
			ensure();
			const mount = url.searchParams.get('mount');
			if (mount && DIGEST.test(mount) && ownBlob(mount)) return new Response(null, { status: 201, headers: { ...headers, location: `${base}/blobs/${mount}`, 'docker-content-digest': mount } });
			const upload = crypto.randomUUID();
			await mkdir(`${root}/packages/uploads`, { recursive: true });
			await Bun.write(uploadPath(root, upload), new Uint8Array(await request.arrayBuffer()));
			const digest = url.searchParams.get('digest');
			if (digest) return finish(upload, digest);
			return new Response(null, { status: 202, headers: { ...headers, location: `${base}/blobs/uploads/${upload}`, range: '0-0', 'docker-upload-uuid': upload } });
		}
		if (!/^[0-9a-f-]{36}$/.test(id) || !existsSync(uploadPath(root, id))) return err(404, 'BLOB_UPLOAD_UNKNOWN', 'No such upload');
		const size = async () => (await stat(uploadPath(root, id))).size;
		if (request.method === 'PATCH') {
			await appendFile(uploadPath(root, id), new Uint8Array(await request.arrayBuffer()));
			return new Response(null, { status: 202, headers: { ...headers, location: `${base}/blobs/uploads/${id}`, range: `0-${(await size()) - 1}`, 'docker-upload-uuid': id } });
		}
		if (request.method === 'PUT') {
			const body = new Uint8Array(await request.arrayBuffer());
			if (body.length) await appendFile(uploadPath(root, id), body);
			return finish(id, url.searchParams.get('digest') ?? '');
		}
		if (request.method === 'GET') return new Response(null, { status: 204, headers: { ...headers, range: `0-${(await size()) - 1}`, 'docker-upload-uuid': id } });
		if (request.method === 'DELETE') return await rm(uploadPath(root, id), { force: true }), new Response(null, { status: 204, headers });
		return err(405, 'UNSUPPORTED', 'Method not allowed');
	}

	async function finish(upload: string, digest: string) {
		if (!DIGEST.test(digest)) return err(400, 'DIGEST_INVALID', 'Give the sha256 digest');
		const file = uploadPath(root, upload);
		const actual = `sha256:${new Bun.CryptoHasher('sha256').update(await Bun.file(file).arrayBuffer()).digest('hex')}`;
		if (actual !== digest) return await rm(file, { force: true }), err(400, 'DIGEST_INVALID', "The content doesn't match its digest");
		const size = (await stat(file)).size;
		await mkdir(blobPath(root, digest).replace(/\/[^/]+$/, ''), { recursive: true });
		await rename(file, blobPath(root, digest));
		db.query('insert or ignore into package_blobs (owner_id, digest, size) values (?, ?, ?)').run(ownerRow!.id, digest, size);
		return new Response(null, { status: 201, headers: { ...headers, location: `${base}/blobs/${digest}`, 'docker-content-digest': digest } });
	}

	if (m[4]) {
		const digest = m[4];
		const b = DIGEST.test(digest) ? ownBlob(digest) : null;
		if (!b || !existsSync(blobPath(root, digest))) return err(404, 'BLOB_UNKNOWN', 'No such blob');
		if (request.method === 'DELETE') return new Response(null, { status: 202, headers });
		const h = { ...headers, 'content-length': String(b.size), 'docker-content-digest': digest, 'content-type': 'application/octet-stream' };
		return new Response(request.method === 'HEAD' ? null : Bun.file(blobPath(root, digest)), { headers: h });
	}

	if (m[5]) {
		const ref = m[5];
		if (request.method === 'PUT') {
			const p = ensure();
			const body = new Uint8Array(await request.arrayBuffer());
			const digest = `sha256:${new Bun.CryptoHasher('sha256').update(body).digest('hex')}`;
			if (DIGEST.test(ref) && ref !== digest) return err(400, 'DIGEST_INVALID', "The manifest doesn't match its digest");
			let manifest: { mediaType?: string; layers?: { digest: string }[]; config?: { digest: string }; manifests?: { digest: string }[] };
			try {
				manifest = JSON.parse(new TextDecoder().decode(body));
			} catch {
				return err(400, 'MANIFEST_INVALID', 'Not JSON');
			}
			// Everything it points at must already be here (blobs, or for an index the platform manifests).
			for (const d of [manifest.config?.digest, ...(manifest.layers ?? []).map((l) => l.digest), ...(manifest.manifests ?? []).map((l) => l.digest)].filter(Boolean) as string[])
				if (!ownBlob(d)) return err(400, 'MANIFEST_BLOB_UNKNOWN', `Missing ${d}`);
			const type = request.headers.get('content-type') ?? manifest.mediaType ?? 'application/vnd.oci.image.manifest.v1+json';
			await mkdir(blobPath(root, digest).replace(/\/[^/]+$/, ''), { recursive: true });
			await Bun.write(blobPath(root, digest), body);
			db.query('insert into package_blobs (owner_id, digest, size, media_type) values (?, ?, ?, ?) on conflict do update set media_type = excluded.media_type').run(ownerRow.id, digest, body.length, type);
			const size = body.length + (manifest.layers ?? []).reduce((n, l) => n + (ownBlob(l.digest)?.size ?? 0), 0);
			for (const version of new Set([ref, digest]))
				db
					.query('insert into package_versions (package_id, version, digest, media_type, size, user_id) values (?, ?, ?, ?, ?, ?) on conflict do update set digest = excluded.digest, media_type = excluded.media_type, size = excluded.size, user_id = excluded.user_id, created_at = excluded.created_at')
					.run(p.id, version, digest, type, size, who!.user.id);
			db.query("update packages set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(p.id);
			return new Response(null, { status: 201, headers: { ...headers, location: `${base}/manifests/${digest}`, 'docker-content-digest': digest } });
		}
		if (!pkg) return err(404, 'NAME_UNKNOWN', `No image ${owner}/${image}`);
		const v = db.query<{ digest: string; media_type: string; version: string }, [number, string]>('select digest, media_type, version from package_versions where package_id = ? and version = ?').get(pkg.id, ref);
		if (!v) return err(404, 'MANIFEST_UNKNOWN', `No tag or digest ${ref}`);
		if (request.method === 'DELETE') {
			db.query('delete from package_versions where package_id = ? and (version = ? or digest = ?)').run(pkg.id, ref, v.digest);
			return new Response(null, { status: 202, headers });
		}
		const file = Bun.file(blobPath(root, v.digest));
		return new Response(request.method === 'HEAD' ? null : file, { headers: { ...headers, 'content-type': v.media_type, 'docker-content-digest': v.digest, 'content-length': String(file.size) } });
	}

	if (!pkg) return err(404, 'NAME_UNKNOWN', `No image ${owner}/${image}`);
	const tags = db.query<{ version: string }, [number]>("select version from package_versions where package_id = ? and version not like 'sha256:%' order by version").all(pkg.id).map((t) => t.version);
	return Response.json({ name: `${owner}/${image}`, tags }, { headers });
}

// Generic packages, as Forgejo/Gitea serve them: PUT/GET/DELETE /api/packages/<owner>/generic/<name>/<version>/<file>.
export async function genericPackage(db: Database, root: string, request: Request, url: URL) {
	const m = url.pathname.match(/^\/api\/packages\/([^/]+)\/generic\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._+-]+)\/([A-Za-z0-9._+-]+)$/);
	if (!m) return Response.json({ message: 'Not found' }, { status: 404 });
	const [, owner, name, version, file] = m;
	const who = authUser(db, request);
	if (who === undefined) return Response.json({ message: 'That token is unknown or expired' }, { status: 401, headers: challenge });
	const ownerRow = db.query<UserRow, [string]>("select * from users where login = ? and kind != 'agent'").get(owner);
	if (!ownerRow) return Response.json({ message: `No user or organization called ${owner}` }, { status: 404 });
	const pkg = db.query<Pkg, [number, string]>("select * from packages where owner_id = ? and type = 'generic' and name = ?").get(ownerRow.id, name);
	const canWrite = !!who && who.write && member(db, ownerRow.id, who.user.id);
	const canRead = canWrite || (!!who && member(db, ownerRow.id, who.user.id)) || (!!pkg && !pkg.private);
	const key = `${version}/${file}`;
	if (request.method === 'GET' || request.method === 'HEAD') {
		if (!canRead) return Response.json({ message: 'Not found' }, { status: who ? 404 : 401, headers: who ? {} : challenge });
		const v = pkg && db.query<{ digest: string; size: number }, [number, string]>('select digest, size from package_versions where package_id = ? and version = ?').get(pkg.id, key);
		if (!v) return Response.json({ message: 'Not found' }, { status: 404 });
		return new Response(request.method === 'HEAD' ? null : Bun.file(blobPath(root, v.digest)), {
			headers: { 'content-type': 'application/octet-stream', 'content-length': String(v.size), 'content-disposition': `attachment; filename="${file}"` }
		});
	}
	if (!canWrite) return Response.json({ message: `You can't publish to ${owner}` }, { status: who ? 403 : 401, headers: who ? {} : challenge });
	if (request.method === 'PUT') {
		const body = new Uint8Array(await request.arrayBuffer());
		const digest = `sha256:${new Bun.CryptoHasher('sha256').update(body).digest('hex')}`;
		const p = pkg ?? db.query<Pkg, [number, string]>("insert into packages (owner_id, type, name) values (?, 'generic', ?) returning *").get(ownerRow.id, name)!;
		if (db.query('select 1 from package_versions where package_id = ? and version = ?').get(p.id, key)) return Response.json({ message: `${key} already exists` }, { status: 409 });
		await mkdir(blobPath(root, digest).replace(/\/[^/]+$/, ''), { recursive: true });
		await Bun.write(blobPath(root, digest), body);
		db.query('insert or ignore into package_blobs (owner_id, digest, size) values (?, ?, ?)').run(ownerRow.id, digest, body.length);
		db.query('insert into package_versions (package_id, version, digest, size, user_id) values (?, ?, ?, ?, ?)').run(p.id, key, digest, body.length, who!.user.id);
		db.query("update packages set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(p.id);
		return new Response(null, { status: 201 });
	}
	if (request.method === 'DELETE') {
		if (!pkg) return Response.json({ message: 'Not found' }, { status: 404 });
		db.query('delete from package_versions where package_id = ? and version = ?').run(pkg.id, key);
		return new Response(null, { status: 204 });
	}
	return Response.json({ message: 'Method not allowed' }, { status: 405 });
}

export { member };
