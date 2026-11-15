import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';

// actions/upload-artifact@v4 and download-artifact@v4. The toolkit reads its run and job ids from ACTIONS_RUNTIME_TOKEN (a JWT whose
// `scp` is "Actions.Results:<run>:<job>"), calls a Twirp service at ACTIONS_RESULTS_URL (Shed's root), and moves the bytes as Azure-style
// block uploads to a signed URL that Shed also serves.

const b64u = (b: Uint8Array) => b.toBase64({ alphabet: 'base64url', omitPadding: true });
const enc = new TextEncoder();
const hmac = (key: string, data: string) => b64u(new Uint8Array(new Bun.CryptoHasher('sha256', key).update(data).digest()));

export function runtimeToken(key: string, runId: number, jobId: number, taskId: number) {
	const head = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
	const body = b64u(enc.encode(JSON.stringify({ scp: `Actions.Results:${runId}:${jobId}`, task: taskId, exp: Math.floor(Date.now() / 1000) + 86400 })));
	return `${head}.${body}.${hmac(key, `${head}.${body}`)}`;
}
function verify(key: string, token: string | undefined) {
	const [head, body, sig] = (token ?? '').split('.');
	if (!sig || hmac(key, `${head}.${body}`) !== sig) return null;
	const claims = JSON.parse(new TextDecoder().decode(Uint8Array.fromBase64(body, { alphabet: 'base64url' })));
	if (claims.exp * 1000 < Date.now()) return null;
	const [, run, job] = String(claims.scp).split(':').map(Number);
	return { run, job };
}

export type ArtifactRow = { id: number; run_id: number; job_id: number; name: string; size: number; status: string; created_at: string; expires_at: string };
export const artifactDir = (root: string, id: number) => `${root}/actions/artifacts/${id}`;
export const artifactFile = (root: string, id: number) => `${artifactDir(root, id)}/artifact.zip`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const twirpError = (code: string, msg: string, status: number) => json({ code, msg }, status);
// The toolkit sends proto JSON in either naming; read both.
const get = (o: Record<string, unknown>, camel: string) => o[camel] ?? o[camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];
const valid = (name: string) => !!name && !/[\\/:*?"<>|\r\n]/.test(name) && !name.startsWith('.');

function sign(key: string, origin: string, kind: 'upload' | 'download', id: number) {
	const expires = Math.floor(Date.now() / 1000) + 6 * 3600;
	return `${origin}/_apis/shed/artifacts/${kind}/${id}?expires=${expires}&sig=${hmac(key, `${kind}:${id}:${expires}`)}`;
}

export async function artifactTwirp(db: Database, root: string, origin: string, key: string, request: Request, method: string) {
	const ids = verify(key, request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
	if (!ids) return twirpError('unauthenticated', 'Bad or expired runtime token', 401);
	const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const run = Number(get(b, 'workflowRunBackendId') ?? ids.run);
	if (run !== ids.run) return twirpError('permission_denied', 'Not this run', 403);
	const name = String(get(b, 'name') ?? '');
	const row = () => db.query<ArtifactRow, [number, string]>('select * from artifacts where run_id = ? and name = ?').get(run, name);
	const art = (a: ArtifactRow) => ({ workflowRunBackendId: String(a.run_id), workflowJobRunBackendId: String(a.job_id), databaseId: String(a.id), name: a.name, size: String(a.size), createdAt: a.created_at });
	switch (method) {
		case 'CreateArtifact': {
			if (!valid(name)) return twirpError('invalid_argument', `Invalid artifact name "${name}"`, 400);
			const old = row();
			if (old?.status === 'done') return twirpError('already_exists', `An artifact called ${name} already exists in this run`, 409);
			if (old) await rm(artifactDir(root, old.id), { recursive: true, force: true }), db.query('delete from artifacts where id = ?').run(old.id);
			const days = Number(get(b, 'expiresAt') ? 0 : 0) || 90;
			const id = Number(db.query("insert into artifacts (run_id, job_id, name, expires_at) values (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))").run(run, ids.job, name, `+${days} days`).lastInsertRowid);
			return json({ ok: true, signedUploadUrl: sign(key, origin, 'upload', id) });
		}
		case 'FinalizeArtifact': {
			const a = row();
			if (!a) return twirpError('not_found', `No artifact called ${name}`, 404);
			const file = artifactFile(root, a.id);
			if (!existsSync(file)) return twirpError('failed_precondition', 'Nothing was uploaded', 400);
			db.query("update artifacts set status = 'done', size = ? where id = ?").run(Bun.file(file).size, a.id);
			return json({ ok: true, artifactId: String(a.id) });
		}
		case 'ListArtifacts': {
			const nameFilter = get(b, 'nameFilter') as string | { value?: string } | undefined;
			const idFilter = get(b, 'idFilter') as string | { value?: string } | undefined;
			const nf = typeof nameFilter === 'object' ? nameFilter?.value : nameFilter;
			const idf = typeof idFilter === 'object' ? idFilter?.value : idFilter;
			const list = db
				.query<ArtifactRow, [number]>("select * from artifacts where run_id = ? and status = 'done' order by id")
				.all(run)
				.filter((a) => (!nf || a.name === nf) && (!idf || String(a.id) === String(idf)));
			return json({ artifacts: list.map(art) });
		}
		case 'GetSignedArtifactURL': {
			const a = row();
			if (!a || a.status !== 'done') return twirpError('not_found', `No artifact called ${name}`, 404);
			return json({ signedUrl: sign(key, origin, 'download', a.id) });
		}
		case 'DeleteArtifact': {
			const a = row();
			if (!a) return twirpError('not_found', `No artifact called ${name}`, 404);
			await rm(artifactDir(root, a.id), { recursive: true, force: true });
			db.query('delete from artifacts where id = ?').run(a.id);
			return json({ ok: true, artifactId: String(a.id) });
		}
	}
	return twirpError('bad_route', `No method ${method}`, 404);
}

// The signed URLs: blocks are PUT with ?comp=block&blockid=…, then ?comp=blocklist names them in order; GET downloads the zip.
export async function artifactBlob(db: Database, root: string, key: string, request: Request, url: URL) {
	const m = url.pathname.match(/^\/_apis\/shed\/artifacts\/(upload|download)\/(\d+)$/);
	const expires = Number(url.searchParams.get('expires'));
	if (!m || expires * 1000 < Date.now() || hmac(key, `${m[1]}:${m[2]}:${expires}`) !== url.searchParams.get('sig')) return new Response('Bad or expired link', { status: 403 });
	const id = Number(m[2]);
	const a = db.query<ArtifactRow, [number]>('select * from artifacts where id = ?').get(id);
	if (!a) return new Response('Not found', { status: 404 });
	const dir = artifactDir(root, id);
	const ok = () => new Response(null, { status: 201, headers: { 'x-ms-request-id': crypto.randomUUID(), etag: `"${Date.now()}"`, 'last-modified': new Date().toUTCString() } });
	if (m[1] === 'download') {
		if (request.method !== 'GET' || a.status !== 'done') return new Response('Not found', { status: 404 });
		return new Response(Bun.file(artifactFile(root, id)), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${encodeURIComponent(a.name)}.zip"` } });
	}
	if (request.method !== 'PUT' || a.status === 'done') return new Response('Not allowed', { status: 405 });
	const comp = url.searchParams.get('comp');
	await mkdir(`${dir}/blocks`, { recursive: true });
	const blockName = (blockId: string) => `${dir}/blocks/${new Bun.CryptoHasher('sha256').update(blockId).digest('hex')}`;
	if (comp === 'block') {
		await Bun.write(blockName(url.searchParams.get('blockid') ?? ''), await request.arrayBuffer());
		return ok();
	}
	if (comp === 'blocklist') {
		const xml = await request.text();
		const ids = [...xml.matchAll(/<(?:Latest|Committed|Uncommitted)>([^<]*)<\//g)].map((x) => x[1]);
		const parts = ids.map((b) => Bun.file(blockName(b)));
		if (parts.some((p) => !existsSync(p.name!))) return new Response('Missing block', { status: 400 });
		await Bun.write(artifactFile(root, id), new Blob(parts));
		for (const f of await readdir(`${dir}/blocks`)) await rm(`${dir}/blocks/${f}`);
		return ok();
	}
	// A single PUT with the whole file.
	await Bun.write(artifactFile(root, id), await request.arrayBuffer());
	return ok();
}

// actions/upload-artifact@v3 and download-artifact@v3 (the older "pipelines" API at ACTIONS_RUNTIME_URL = <origin>/api/actions_pipeline/):
// one container per name per run, files PUT in Content-Range chunks (optionally gzipped), PATCHed to finish.
type Manifest = Record<string, { gzip: boolean }>;
const manifestPath = (root: string, id: number) => `${artifactDir(root, id)}/manifest.json`;
const filePath = (root: string, id: number, path: string) => `${artifactDir(root, id)}/files/${new Bun.CryptoHasher('sha256').update(path).digest('hex')}`;
async function manifest(root: string, id: number): Promise<Manifest> {
	const f = Bun.file(manifestPath(root, id));
	return (await f.exists()) ? f.json() : {};
}

export async function artifactPipeline(db: Database, root: string, origin: string, key: string, request: Request, url: URL) {
	const m = url.pathname.match(/^\/api\/actions_pipeline\/_apis\/pipelines\/workflows\/(\d+)\/artifacts(?:\/(\d+)\/(upload|download))?$/);
	if (!m) return json({ message: 'Not found' }, 404);
	const ids = verify(key, request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
	const run = Number(m[1]);
	if (!ids || ids.run !== run) return json({ message: 'Bad or expired runtime token' }, 401);
	const base = `${origin}/api/actions_pipeline/_apis/pipelines/workflows/${run}/artifacts`;
	const [, , id, kind] = m;
	const named = (name: string) => db.query<ArtifactRow, [number, string]>('select * from artifacts where run_id = ? and name = ?').get(run, name);
	if (!id && request.method === 'POST') {
		const { Name: name } = (await request.json()) as { Name: string };
		if (!valid(name)) return json({ message: `Invalid artifact name "${name}"` }, 400);
		let a = named(name);
		if (a?.status === 'done') return json({ message: `An artifact called ${name} already exists in this run` }, 409);
		if (!a) a = db.query<ArtifactRow, [number, number, string]>('insert into artifacts (run_id, job_id, name) values (?, ?, ?) returning *').get(run, ids.job, name)!;
		return json({ name, type: 'actions_storage', fileContainerResourceUrl: `${base}/${a.id}/upload` });
	}
	if (!id && request.method === 'PATCH') {
		const a = named(url.searchParams.get('artifactName') ?? '');
		if (!a) return json({ message: 'No such artifact' }, 404);
		const size = Object.keys(await manifest(root, a.id)).reduce((n, p) => n + Bun.file(filePath(root, a.id, p)).size, 0);
		db.query("update artifacts set status = 'done', size = ? where id = ?").run(size, a.id);
		return json({ name: a.name, size });
	}
	if (!id && request.method === 'GET') {
		const list = db.query<ArtifactRow, [number]>("select * from artifacts where run_id = ? and status = 'done' order by id").all(run);
		return json({ count: list.length, value: list.map((a) => ({ name: a.name, fileContainerResourceUrl: `${base}/${a.id}/download` })) });
	}
	const a = db.query<ArtifactRow, [number, number]>('select * from artifacts where id = ? and run_id = ?').get(Number(id), run);
	if (!a) return json({ message: 'No such artifact' }, 404);
	if (kind === 'upload' && request.method === 'PUT') {
		const itemPath = url.searchParams.get('itemPath') ?? '';
		if (!itemPath.startsWith(`${a.name}/`) || itemPath.split('/').includes('..')) return json({ message: 'Bad item path' }, 400);
		const [, start = '0'] = (request.headers.get('content-range') ?? '').match(/bytes (\d+)-/) ?? [];
		const body = new Uint8Array(await request.arrayBuffer());
		const { open, mkdir: mk } = await import('node:fs/promises');
		await mk(`${artifactDir(root, a.id)}/files`, { recursive: true });
		const p = filePath(root, a.id, itemPath);
		const fh = await open(p, existsSync(p) ? 'r+' : 'w');
		await fh.write(body, 0, body.length, Number(start));
		await fh.close();
		const mf = await manifest(root, a.id);
		mf[itemPath] = { gzip: request.headers.get('content-encoding') === 'gzip' };
		await Bun.write(manifestPath(root, a.id), JSON.stringify(mf));
		return json({ message: 'ok' });
	}
	if (kind === 'download' && request.method === 'GET') {
		const mf = await manifest(root, a.id);
		const item = url.searchParams.get('item');
		if (item !== null) {
			if (!mf[item]) return json({ message: 'No such file' }, 404);
			return new Response(Bun.file(filePath(root, a.id, item)), { headers: { 'content-type': 'application/octet-stream', ...(mf[item].gzip && { 'content-encoding': 'gzip' }) } });
		}
		const prefix = url.searchParams.get('itemPath') ?? '';
		const value = Object.keys(mf)
			.filter((p) => p.startsWith(prefix))
			.map((path) => ({ path, itemType: 'file', contentLocation: `${base}/${a.id}/download?item=${encodeURIComponent(path)}` }));
		return json({ count: value.length, value });
	}
	return json({ message: 'Not allowed' }, 405);
}

// For people downloading from the run page: v4 artifacts are already a zip; v3 ones are zipped (stored, uncompressed) on the way out.
export async function artifactZip(root: string, a: ArtifactRow) {
	if (existsSync(artifactFile(root, a.id))) return Bun.file(artifactFile(root, a.id));
	const { gunzipSync } = await import('node:zlib');
	const mf = await manifest(root, a.id);
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const [path, { gzip }] of Object.entries(mf)) {
		let data = new Uint8Array(await Bun.file(filePath(root, a.id, path)).arrayBuffer());
		if (gzip) data = new Uint8Array(gunzipSync(data));
		const name = enc.encode(path.slice(a.name.length + 1));
		const crc = Bun.hash.crc32(data);
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, data.length, true);
		local.setUint32(22, data.length, true);
		local.setUint16(26, name.length, true);
		const dir = new DataView(new ArrayBuffer(46));
		dir.setUint32(0, 0x02014b50, true);
		dir.setUint16(4, 20, true);
		dir.setUint16(6, 20, true);
		dir.setUint32(16, crc, true);
		dir.setUint32(20, data.length, true);
		dir.setUint32(24, data.length, true);
		dir.setUint16(28, name.length, true);
		dir.setUint32(42, offset, true);
		parts.push(new Uint8Array(local.buffer), name, data);
		central.push(new Uint8Array(dir.buffer), name);
		offset += 30 + name.length + data.length;
	}
	const size = central.reduce((n, c) => n + c.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, central.length / 2, true);
	end.setUint16(10, central.length / 2, true);
	end.setUint32(12, size, true);
	end.setUint32(16, offset, true);
	return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[]);
}
