import type { Database } from 'bun:sqlite';
import { tokenAuth } from './accounts.js';
import { atLeast, tokenAccess, type Level } from './access.js';
import { spawn } from './git.js';
import { getRepo, repoDir } from './repos.js';
import { afterPush, refSnapshot } from './push.js';
import { receivePackSetup } from './pushcheck.js';

// Git's smart HTTP protocol (what `git clone https://…` speaks): GET info/refs, then POST to upload-pack (fetch) or receive-pack (push).
// git authenticates with Basic auth; the password is a Shed token (the username is ignored).
const ROUTE = /^\/([^/]+)\/([^/]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/;

const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, '0') + s;
const deny = (status: number, text: string, auth = false) =>
	new Response(`${text}\n`, { status, headers: { 'content-type': 'text/plain', ...(auth && { 'www-authenticate': 'Basic realm="Shed", charset="UTF-8"' }) } });

export function isGitRequest(url: URL) {
	return ROUTE.test(url.pathname);
}

export async function gitHttp(db: Database, root: string, request: Request, url: URL) {
	const [, owner, name, action] = url.pathname.match(ROUTE)!;
	const service = action === 'info/refs' ? url.searchParams.get('service') : action;
	if (service !== 'git-upload-pack' && service !== 'git-receive-pack') return deny(403, 'Only the smart HTTP protocol is supported; upgrade git');
	if (action !== 'info/refs' && request.method !== 'POST') return deny(405, 'Method not allowed');

	const header = request.headers.get('authorization');
	const basic = header?.match(/^Basic\s+(.+)$/i)?.[1];
	const password = basic ? new TextDecoder().decode(Uint8Array.fromBase64(basic)).split(':').slice(1).join(':') : undefined;
	const token = password ? tokenAuth(db, password) : null;
	if (password && !token) return deny(401, 'That token is unknown or expired', true);

	const repo = getRepo(db, owner, name);
	const need: Level = service === 'git-receive-pack' ? 'write' : 'read';
	const level: Level = repo ? (token ? tokenAccess(db, token, repo) : repo.private ? 'none' : 'read') : 'none';
	if (!repo || !atLeast(level, need)) {
		// Ask anonymous clients to log in rather than saying whether a private repo exists.
		if (!token) return deny(401, 'Sign in with a Shed token as the password', true);
		return repo && atLeast(level, 'read') ? deny(403, `This token can't push to ${owner}/${name}`) : deny(404, 'Repository not found');
	}
	if (need === 'write' && repo.archived) return deny(403, `${owner}/${name} is archived`);

	const dir = repoDir(root, repo.id);
	const protocol = request.headers.get('git-protocol') ?? '';
	const env = /^[A-Za-z0-9=:,.]+$/.test(protocol) ? { GIT_PROTOCOL: protocol } : undefined;
	const cmd = service.slice(4);
	const headers = { 'cache-control': 'no-cache' };

	if (action === 'info/refs') {
		const out = await new Response(spawn([cmd, '--stateless-rpc', '--advertise-refs', dir], undefined, env).stdout).bytes();
		// Protocol v2 starts with its own capability list; v0/v1 clients expect the service line first.
		const head = protocol.includes('version=2') ? '' : `${pkt(`# service=${service}\n`)}0000`;
		return new Response(new Blob([head, out]), { headers: { ...headers, 'content-type': `application/x-${service}-advertisement` } });
	}

	let body = request.body ?? new ReadableStream();
	if (request.headers.get('content-encoding') === 'gzip') body = body.pipeThrough(new DecompressionStream('gzip'));
	const before = service === 'git-receive-pack' ? await refSnapshot(dir) : null;
	// Branch protection runs as a pre-receive hook (see pushcheck.ts).
	const check = before ? await receivePackSetup(db, root, repo.id, level) : { args: [], env: {} };
	const proc = spawn([...check.args, cmd, '--stateless-rpc', dir], body, { ...env, ...check.env });
	if (before) proc.exited.then((code) => (code === 0 ? afterPush(db, root, repo, token!.userId, before) : undefined)).catch((e) => console.error('after push', e));
	return new Response(proc.stdout, { headers: { ...headers, 'content-type': `application/x-${service}-result` } });
}
