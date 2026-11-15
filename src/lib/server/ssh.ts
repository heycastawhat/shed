import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Server, utils, type Connection } from 'ssh2';
import { access, atLeast } from './access.js';
import { getUser } from './accounts.js';
import { spawn } from './git.js';
import { afterPush, refSnapshot } from './push.js';
import { receivePackSetup } from './pushcheck.js';
import { getRepo, repoDir } from './repos.js';

// git over SSH, served by Shed itself (no system sshd): any username, the key decides who you are. Only git-upload-pack,
// git-receive-pack and git-upload-archive run, against repos the key's owner may read (or write, to push).

export type SshKeyRow = { id: number; user_id: number; name: string; type: string; key: string; fingerprint: string; created_at: string; last_used_at: string | null };

export function parseKey(text: string) {
	const k = utils.parseKey(text.trim());
	if (k instanceof Error || Array.isArray(k) || k.isPrivateKey()) throw new Error("That isn't an SSH public key (paste the contents of a .pub file)");
	const blob = k.getPublicSSH();
	const fingerprint = `SHA256:${new Bun.CryptoHasher('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
	return { type: k.type, key: blob.toString('base64'), fingerprint };
}

function hostKey(dataDir: string) {
	const path = `${dataDir}/ssh/host_ed25519`;
	if (!existsSync(path)) {
		mkdirSync(`${dataDir}/ssh`, { recursive: true });
		writeFileSync(path, utils.generateKeyPairSync('ed25519').private, { mode: 0o600 });
	}
	return readFileSync(path);
}

// "git-upload-pack '/owner/repo.git'" → the command and the repo, or null for anything else.
export function parseCommand(cmd: string) {
	const m = cmd.match(/^(git-upload-pack|git-receive-pack|git-upload-archive) '?\/?([^/'\s]+)\/([^/'\s]+?)(?:\.git)?\/?'?$/);
	return m ? { service: m[1], owner: m[2], repo: m[3] } : null;
}

export function startSsh(db: Database, root: string, port: number, host = '0.0.0.0') {
	const server = new Server({ hostKeys: [hostKey(root)] }, (client: Connection) => {
		let userId: number | null = null;
		client.on('authentication', (ctx) => {
			if (ctx.method !== 'publickey') return ctx.reject(['publickey']);
			const row = db.query<SshKeyRow, [string]>('select * from ssh_keys where key = ?').get(ctx.key.data.toString('base64'));
			const k = row && utils.parseKey(Buffer.from(`${row.type} ${row.key}`));
			if (!row || !k || k instanceof Error || Array.isArray(k) || k.type !== ctx.key.algo) return ctx.reject(['publickey']);
			// Without a signature the client is only asking whether this key would do; with one, it must verify.
			if (ctx.signature && !k.verify(ctx.blob!, ctx.signature, ctx.hashAlgo)) return ctx.reject(['publickey']);
			if (ctx.signature) {
				userId = row.user_id;
				db.query("update ssh_keys set last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(row.id);
			}
			ctx.accept();
		});
		client.on('ready', () => {
			client.on('session', (acceptSession) => {
				const session = acceptSession();
				const env: Record<string, string> = {};
				session.on('env', (accept, _reject, info) => {
					if (info.key === 'GIT_PROTOCOL' && /^[A-Za-z0-9=:,.]+$/.test(info.val)) env.GIT_PROTOCOL = info.val;
					accept?.();
				});
				session.on('shell', (accept) => {
					const s = accept();
					const u = userId ? getUser(db, userId) : null;
					s.write(`Hi ${u?.login ?? 'there'}! You've signed in to Shed with SSH, but there's no shell; use git.\r\n`);
					s.exit(0);
					s.end();
				});
				session.on('exec', async (accept, _reject, info) => {
					const s = accept();
					const fail = (msg: string) => {
						s.stderr.write(`shed: ${msg}\n`);
						s.exit(1);
						s.end();
					};
					const cmd = parseCommand(info.command);
					if (!cmd) return fail('Only git commands are allowed here');
					const repo = getRepo(db, cmd.owner, cmd.repo);
					const level = repo ? access(db, userId ?? undefined, repo) : 'none';
					if (!repo || !atLeast(level, 'read')) return fail(`Repository ${cmd.owner}/${cmd.repo} not found`);
					const push = cmd.service === 'git-receive-pack';
					if (push && !atLeast(level, 'write')) return fail(`You can't push to ${cmd.owner}/${cmd.repo}`);
					if (push && repo.archived) return fail(`${cmd.owner}/${cmd.repo} is archived`);
					if (push && repo.mirror_url) return fail(`${cmd.owner}/${cmd.repo} is a mirror; push to the repo it copies`);
					const dir = repoDir(root, repo.id);
					const before = push ? await refSnapshot(dir) : null;
					// Branch protection runs as a pre-receive hook, as for HTTPS pushes (see pushcheck.ts).
					const check = push ? await receivePackSetup(db, root, repo.id, level) : { args: [], env: {} };
					const proc = spawn([...check.args, cmd.service.slice(4), dir], new ReadableStream({ start: (ctl) => {
						s.on('data', (d: Buffer) => ctl.enqueue(new Uint8Array(d)));
						s.on('end', () => ctl.close());
						s.on('close', () => { try { ctl.close(); } catch {} });
					} }), { ...env, ...check.env });
					void (async () => { for await (const chunk of proc.stdout) s.write(Buffer.from(chunk)); })();
					void (async () => { for await (const chunk of proc.stderr) s.stderr.write(Buffer.from(chunk)); })();
					const code = await proc.exited;
					if (before && code === 0) await afterPush(db, root, repo, userId!, before).catch((e) => console.error('after push', e));
					s.exit(code);
					s.end();
				});
			});
		});
		client.on('error', () => {});
	});
	// A taken port shouldn't take the web server down with it.
	server.on('error', (e: Error) => console.error(`[shed] git over SSH can't listen on :${port}: ${e.message}`));
	server.listen(port, host, () => console.log(`[shed] git over SSH on :${port}`));
	return server;
}
