import type { Database } from 'bun:sqlite';
import { chmod, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Level } from './access.js';
import { glob, type Protection } from './api/protect.js';

// Branch protection for git pushes (HTTPS and SSH). receive-pack runs a pre-receive hook (via `core.hooksPath`, so nothing is
// installed in the repos themselves) that sees each ref update after the pack has arrived, so it can tell a force push
// (`merge-base --is-ancestor`) from a fast-forward. The server decides per rule what this pusher may do and hands the hook
// the answers in the environment; the hook only matches branch names and checks ancestry.

// Runs under Bun (the server's own binary). Kept free of imports: it's written to disk as is.
const HOOK = `
const rules = JSON.parse(process.env.SHED_PUSH_RULES || '[]');
const zero = /^0+$/;
const refused = [];
for (const line of (await Bun.stdin.text()).split('\\n')) {
	const [old, next, ref] = line.trim().split(' ');
	if (!ref?.startsWith('refs/heads/')) continue;
	const branch = ref.slice('refs/heads/'.length);
	const rule = rules.find((r) => new RegExp(r.re).test(branch));
	if (!rule) continue;
	if (zero.test(next)) refused.push(branch + ' is a protected branch, so it can\\'t be deleted');
	else if (!rule.push) refused.push(branch + ' is a protected branch: ' + rule.why);
	else if (!zero.test(old) && !rule.force && Bun.spawnSync(['git', 'merge-base', '--is-ancestor', old, next]).exitCode !== 0)
		refused.push(branch + ' is a protected branch, so force pushes to it are refused');
}
if (refused.length) {
	for (const r of refused) console.error('Shed: ' + r);
	process.exit(1);
}
`;

const ready = new Map<string, Promise<string>>();
// The hooks folder lives in the data folder, rewritten once per process so a new build's hook replaces the old one.
export function hooksDir(root: string) {
	if (!ready.has(root))
		ready.set(
			root,
			(async () => {
				// Absolute: git resolves a relative hooksPath against the repo, and finding no hook there it would silently skip the checks.
				const dir = resolve(root, 'hooks');
				await mkdir(dir, { recursive: true });
				await Bun.write(`${dir}/pre-receive`, `#!${process.execPath}\n${HOOK}`);
				await chmod(`${dir}/pre-receive`, 0o755);
				return dir;
			})()
		);
	return ready.get(root)!;
}

const WHY = { none: 'push changes through a pull request', admins: 'only repo admins can push to it' } as const;

// What a pusher with `level` access may do to each protected branch, exact names first (they win over patterns).
export function pushRules(db: Database, repoId: number, level: Level) {
	const rules = db.query<Protection, [number]>('select * from protected_branches where repo_id = ?').all(repoId);
	return rules
		.sort((a, b) => +a.pattern.includes('*') - +b.pattern.includes('*'))
		.map((r) => ({
			re: glob(r.pattern).source,
			push: r.push === 'all' || (r.push === 'admins' && level === 'admin'),
			force: !!r.force_push,
			why: r.push === 'admins' ? WHY.admins : WHY.none
		}));
}

// The extra git arguments and environment for a receive-pack run by someone with `level` access to the repo.
export async function receivePackSetup(db: Database, root: string, repoId: number, level: Level) {
	return { args: ['-c', `core.hooksPath=${await hooksDir(root)}`], env: { SHED_PUSH_RULES: JSON.stringify(pushRules(db, repoId, level)) } };
}
