import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import type { Level } from '../access.js';
import type { RepoRow } from '../repos.js';
import { me, route } from './router.js';
import { repoOf } from './common.js';

export type Protection = {
	id: number;
	repo_id: number;
	pattern: string;
	required_approvals: number;
	required_checks: string;
	block_on_rejected: number;
	dismiss_stale: number;
	push: 'none' | 'admins' | 'all';
	force_push: number;
};

// Glob patterns like Forgejo's: `*` within a segment, `**` across them; an exact name beats a pattern.
export const glob = (p: string) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*')}$`);

export function protectionFor(db: Database, repoId: number, branch: string) {
	const rules = db.query<Protection, [number]>('select * from protected_branches where repo_id = ?').all(repoId);
	return rules.find((r) => r.pattern === branch) ?? rules.find((r) => glob(r.pattern).test(branch)) ?? null;
}

// The same answers pushcheck.ts gives a git push, for ref writes Shed makes on someone's behalf (web edits, branch deletes, PR updates).
// `force` is a write that doesn't fast-forward. Merges into a protected base are gated by the PR rules instead.
export function refWriteRefusal(db: Database, repoId: number, level: Level, branch: string, op: 'push' | 'force' | 'delete') {
	const rule = protectionFor(db, repoId, branch);
	if (!rule) return null;
	if (op === 'delete') return `${branch} is a protected branch, so it can't be deleted`;
	if (rule.push === 'none') return `${branch} is a protected branch: push changes through a pull request`;
	if (rule.push === 'admins' && level !== 'admin') return `${branch} is a protected branch: only repo admins can push to it`;
	if (op === 'force' && !rule.force_push) return `${branch} is a protected branch, so force pushes to it are refused`;
	return null;
}
// A pull mirror's refs belong to the repo it copies (the next sync would undo a write), as for git pushes in githttp.ts and ssh.ts.
export function notMirror(row: RepoRow) {
	if (row.mirror_url) error(403, `${row.owner}/${row.name} is a mirror; push to the repo it copies`);
}
export function checkRefWrite(db: Database, row: RepoRow, level: Level, branch: string, op: 'push' | 'force' | 'delete') {
	notMirror(row);
	const why = refWriteRefusal(db, row.id, level, branch, op);
	if (why) error(403, why);
}

const json = (p: Protection) => ({
	rule_name: p.pattern,
	branch_name: p.pattern,
	required_approvals: p.required_approvals,
	enable_status_check: JSON.parse(p.required_checks).length > 0,
	status_check_contexts: JSON.parse(p.required_checks),
	block_on_rejected_reviews: !!p.block_on_rejected,
	dismiss_stale_approvals: !!p.dismiss_stale,
	enable_push: p.push !== 'none',
	enable_push_whitelist: p.push === 'admins',
	enable_force_push: !!p.force_push
});

route('GET', '/repos/:owner/:repo/branch_protections', (c) => c.db.query<Protection, [number]>('select * from protected_branches where repo_id = ? order by pattern').all(repoOf(c).row.id).map(json));
async function save(c: Parameters<Parameters<typeof route>[2]>[0], existing?: Protection) {
	const r = repoOf(c, 'admin');
	me(c);
	const b = await c.body<{ rule_name?: string; branch_name?: string; required_approvals?: number; status_check_contexts?: string[]; enable_status_check?: boolean; block_on_rejected_reviews?: boolean; dismiss_stale_approvals?: boolean; enable_push?: boolean; enable_push_whitelist?: boolean; enable_force_push?: boolean }>();
	const pattern = (b.rule_name || b.branch_name || existing?.pattern || '').trim();
	if (!pattern) error(422, 'Name the branch or pattern to protect');
	const checks = b.enable_status_check === false ? [] : (b.status_check_contexts ?? (existing ? JSON.parse(existing.required_checks) : []));
	const push = b.enable_push === undefined ? (existing?.push ?? 'none') : !b.enable_push ? 'none' : b.enable_push_whitelist ? 'admins' : 'all';
	const values = [pattern, b.required_approvals ?? existing?.required_approvals ?? 0, JSON.stringify(checks), +(b.block_on_rejected_reviews ?? !!(existing?.block_on_rejected ?? 1)), +(b.dismiss_stale_approvals ?? !!existing?.dismiss_stale), push, +(b.enable_force_push ?? !!existing?.force_push)] as const;
	if (existing) c.db.query('update protected_branches set pattern = ?, required_approvals = ?, required_checks = ?, block_on_rejected = ?, dismiss_stale = ?, push = ?, force_push = ? where id = ?').run(...values, existing.id);
	else c.db.query('insert into protected_branches (pattern, required_approvals, required_checks, block_on_rejected, dismiss_stale, push, force_push, repo_id) values (?, ?, ?, ?, ?, ?, ?, ?)').run(...values, r.row.id);
	return json(c.db.query<Protection, [number, string]>('select * from protected_branches where repo_id = ? and pattern = ?').get(r.row.id, pattern)!);
}
const find = (c: Parameters<Parameters<typeof route>[2]>[0]) =>
	c.db.query<Protection, [number, string]>('select * from protected_branches where repo_id = ? and pattern = ?').get(repoOf(c).row.id, c.params.name) ?? error(404, 'No such rule');
route('POST', '/repos/:owner/:repo/branch_protections', (c) => save(c));
route('GET', '/repos/:owner/:repo/branch_protections/*name', (c) => json(find(c)));
route('PATCH', '/repos/:owner/:repo/branch_protections/*name', (c) => save(c, find(c)));
route('DELETE', '/repos/:owner/:repo/branch_protections/*name', (c) => {
	repoOf(c, 'admin');
	c.db.query('delete from protected_branches where id = ?').run(find(c).id);
});
