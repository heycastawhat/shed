import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { createToken, signIn } from './accounts.js';
import { openDb } from './db.js';
import { ENV, git } from './git.js';
import { gitHttp, isGitRequest } from './githttp.js';
import { onPush, type RefUpdate } from './push.js';
import { createRepo, getRepo, repoDir } from './repos.js';

let root: string, db: Database, server: ReturnType<typeof Bun.serve>, base: string, write: string, read: string, stranger: string;
const pushes: RefUpdate[][] = [];

// Runs the real git client against Shed in-process.
async function client(args: string[], cwd = root) {
	const p = Bun.spawn(['git', '-c', 'credential.helper=', '-c', 'user.name=T', '-c', 'user.email=t@x', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...ENV, GIT_ASKPASS: 'true' } });
	const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
	return { out, err, code };
}
const url = (token: string | null, path: string) => `${base.replace('://', token ? `://x:${token}@` : '://')}/${path}`;

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-git-`);
	db = openDb(':memory:');
	const ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	const other = signIn(db, { sub: '2', preferred_username: 'other' });
	await createRepo(db, root, ada, { name: 'sample' });
	await createRepo(db, root, ada, { name: 'open', private: false });
	write = createToken(db, ada, { name: 'w', scopes: ['repo:read', 'repo:write'] });
	read = createToken(db, ada, { name: 'r', scopes: ['repo:read'] });
	stranger = createToken(db, other, { name: 's', scopes: ['repo:read', 'repo:write'] });
	onPush(({ updates }) => void pushes.push(updates));
	server = Bun.serve({ port: 0, fetch: (req) => (isGitRequest(new URL(req.url)) ? gitHttp(db, root, req, new URL(req.url)) : new Response('no', { status: 404 })) });
	base = `http://localhost:${server.port}`;
});
afterAll(async () => {
	server.stop(true);
	await rm(root, { recursive: true });
});

test('push to an empty repo, then clone it back', async () => {
	await client(['init', '-q', '-b', 'main', 'work']);
	await Bun.write(`${root}/work/a.txt`, 'hello\n');
	await client(['add', '.'], `${root}/work`);
	await client(['commit', '-q', '-m', 'first'], `${root}/work`);
	const push = await client(['push', url(write, 'ada/sample.git'), 'main'], `${root}/work`);
	expect(push.code).toBe(0);
	await Bun.sleep(50);
	expect(pushes.at(-1)).toMatchObject([{ ref: 'refs/heads/main', before: null }]);
	const clone = await client(['clone', '-q', url(write, 'ada/sample'), 'copy']);
	expect(clone.code).toBe(0);
	expect(await Bun.file(`${root}/copy/a.txt`).text()).toBe('hello\n');
	// Protocol v0 as well as git's default v2.
	expect((await client(['-c', 'protocol.version=0', 'clone', '-q', url(read, 'ada/sample.git'), 'copy0'])).code).toBe(0);
});

test('a push of only master becomes the default branch', async () => {
	await createRepo(db, root, getRepo(db, 'ada', 'sample')!.owner_id, { name: 'legacy' });
	await client(['push', url(write, 'ada/legacy'), 'main:master'], `${root}/work`);
	await Bun.sleep(50);
	const repo = getRepo(db, 'ada', 'legacy')!;
	expect(repo.default_branch).toBe('master');
	expect(await git(repoDir(root, repo.id), ['symbolic-ref', 'HEAD'])).toBe('refs/heads/master\n');
});

test('access', async () => {
	expect((await client(['ls-remote', url(null, 'ada/sample')])).err).toMatch(/Authentication failed|could not read|401/);
	expect((await client(['ls-remote', url(stranger, 'ada/sample')])).err).toMatch(/not found|404/);
	expect((await client(['ls-remote', url('shed_bogus', 'ada/sample')])).code).not.toBe(0);
	expect((await client(['push', url(read, 'ada/sample'), 'main:other'], `${root}/work`)).err).toMatch(/403|can't push/);
	expect((await client(['ls-remote', url(null, 'ada/open')])).code).toBe(0);
	expect((await client(['push', url(null, 'ada/open'), 'main'], `${root}/work`)).code).not.toBe(0);
	expect((await fetch(`${base}/ada/sample/info/refs`)).status).toBe(403);
});
