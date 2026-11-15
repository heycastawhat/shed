import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { signIn } from './accounts.js';
import { openDb } from './db.js';
import { ENV } from './git.js';
import { createRepo } from './repos.js';
import { parseCommand, parseKey, startSsh } from './ssh.js';

let root: string, db: Database, server: ReturnType<typeof startSsh>, port: number;

async function run(args: string[], cwd = root, key = 'ada') {
	const ssh = `ssh -i ${root}/${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -p ${port}`;
	const p = Bun.spawn(['git', '-c', 'user.name=T', '-c', 'user.email=t@x', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...ENV, GIT_SSH_COMMAND: ssh } });
	const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
	return { out, err, code };
}

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-ssh-`);
	db = openDb(':memory:');
	const ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	const other = signIn(db, { sub: '2', preferred_username: 'other' });
	await createRepo(db, root, ada, { name: 'sample' });
	for (const [name, uid] of [['ada', ada], ['other', other]] as const) {
		await Bun.spawn(['ssh-keygen', '-t', 'ed25519', '-N', '', '-q', '-f', `${root}/${name}`]).exited;
		const k = parseKey(await Bun.file(`${root}/${name}.pub`).text());
		db.query('insert into ssh_keys (user_id, name, type, key, fingerprint) values (?, ?, ?, ?, ?)').run(uid, name, k.type, k.key, k.fingerprint);
	}
	await Bun.spawn(['ssh-keygen', '-t', 'ed25519', '-N', '', '-q', '-f', `${root}/stranger`]).exited;
	port = 20000 + Math.floor(Math.random() * 20000);
	server = startSsh(db, root, port, '127.0.0.1');
	await Bun.sleep(100);
});
afterAll(async () => {
	server.close();
	await rm(root, { recursive: true });
});

test('commands', () => {
	expect(parseCommand("git-upload-pack '/ada/sample.git'")).toEqual({ service: 'git-upload-pack', owner: 'ada', repo: 'sample' });
	expect(parseCommand("git-receive-pack 'ada/sample'")).toEqual({ service: 'git-receive-pack', owner: 'ada', repo: 'sample' });
	expect(parseCommand('rm -rf /')).toBeNull();
	expect(parseCommand("git-upload-pack '../../etc'")).toBeNull();
	expect(() => parseKey('nonsense')).toThrow();
});

test('push and clone over SSH, with access checks', async () => {
	const url = `ssh://git@127.0.0.1:${port}/ada/sample.git`;
	await run(['init', '-q', '-b', 'main', 'work']);
	await Bun.write(`${root}/work/a.txt`, 'hi\n');
	await run(['add', '.'], `${root}/work`);
	await run(['commit', '-q', '-m', 'first'], `${root}/work`);
	expect((await run(['push', url, 'main'], `${root}/work`)).code).toBe(0);
	expect((await run(['clone', '-q', url, 'copy'])).code).toBe(0);
	expect(await Bun.file(`${root}/copy/a.txt`).text()).toBe('hi\n');
	expect((await run(['clone', '-q', url, 'nope'], root, 'other')).err).toMatch(/not found/);
	expect((await run(['ls-remote', url], root, 'stranger')).code).not.toBe(0);
});

test('branch protection applies over SSH too', async () => {
	const url = `ssh://git@127.0.0.1:${port}/ada/sample.git`;
	const repo = db.query<{ id: number }, []>("select id from repos where name = 'sample'").get()!;
	db.query("insert into protected_branches (repo_id, pattern, push) values (?, 'main', 'none')").run(repo.id);
	await Bun.write(`${root}/work/b.txt`, 'more\n');
	await run(['add', '.'], `${root}/work`);
	await run(['commit', '-q', '-m', 'second'], `${root}/work`);
	const res = await run(['push', url, 'main'], `${root}/work`);
	expect(res.code).not.toBe(0);
	expect((await run(['push', url, 'main:other'], `${root}/work`)).code).toBe(0);
});
