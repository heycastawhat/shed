import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { access, atLeast, tokenAccess, type Level } from '../access.js';
import { toUser, type UserRow } from '../accounts.js';
import { git, gitTry } from '../git.js';
import { getRepo, repoDir, type RepoRow } from '../repos.js';
import { toRepo } from '../shedrepo-shape.js';
import type { Ctx } from './router.js';

export const now = () => new Date().toISOString();

export function repoOf(c: Ctx, need: Level = 'read') {
	const row = getRepo(c.db, c.params.owner, c.params.repo);
	const level: Level = !row ? 'none' : c.token ? tokenAccess(c.db, c.token, row) : access(c.db, c.user?.id, row);
	if (!row || !atLeast(level, 'read')) error(404, 'Repository not found');
	if (!atLeast(level, need)) error(403, `You need ${need} access to ${row.owner}/${row.name}`);
	if (need !== 'read' && row.archived) error(403, `${row.owner}/${row.name} is archived`);
	return { row, level, dir: repoDir(c.root, row.id), full: `${row.owner}/${row.name}` };
}
export type RepoCtx = ReturnType<typeof repoOf>;

export function userRow(db: Database, id: number) {
	return db.query<UserRow, [number]>('select * from users where id = ?').get(id)!;
}
export const userJson = (db: Database, id: number | null | undefined) => (id ? toUser(userRow(db, id)) : null);
export function userByLogin(db: Database, login: string) {
	return db.query<UserRow, [string]>('select * from users where login = ?').get(login);
}

export async function repoJson(c: Ctx, row: RepoRow) {
	const level = c.token ? tokenAccess(c.db, c.token, row) : access(c.db, c.user?.id, row);
	const dir = repoDir(c.root, row.id);
	const empty = !(await git(dir, ['for-each-ref', '--count=1', '--format=x', 'refs/heads'])).trim();
	const r = toRepo(row, userRow(c.db, row.owner_id), level, empty, c.origin);
	const n = (sql: string) => c.db.query<{ n: number }, [number]>(sql).get(row.id)!.n;
	const extra = c.db.query<{ has_issues: number; has_wiki: number; default_merge_style: string; delete_branch_after_merge: number; merge_styles: string; fork_of: number | null }, [number]>(
		'select has_issues, has_wiki, default_merge_style, delete_branch_after_merge, merge_styles, fork_of from repos where id = ?'
	).get(row.id)!;
	const styles: string[] = JSON.parse(extra.merge_styles);
	return {
		...r,
		open_pr_counter: n("select count(*) as n from issues where repo_id = ? and is_pull = 1 and state = 'open'"),
		open_issues_count: n("select count(*) as n from issues where repo_id = ? and is_pull = 0 and state = 'open'"),
		stars_count: n('select count(*) as n from stars where repo_id = ?'),
		watchers_count: n('select count(*) as n from watches where repo_id = ?'),
		forks_count: n('select count(*) as n from repos where fork_of = ?'),
		release_counter: n('select count(*) as n from releases where repo_id = ? and draft = 0'),
		has_issues: !!extra.has_issues,
		has_wiki: !!extra.has_wiki,
		has_pull_requests: true,
		fork: !!extra.fork_of,
		default_merge_style: extra.default_merge_style as never,
		default_delete_branch_after_merge: !!extra.delete_branch_after_merge,
		allow_merge_commits: styles.includes('merge'),
		allow_rebase: styles.includes('rebase'),
		allow_rebase_explicit: styles.includes('rebase-merge'),
		allow_squash_merge: styles.includes('squash'),
		allow_fast_forward_only_merge: styles.includes('fast-forward-only'),
		created_at: row.created_at
	};
}

export async function refSha(dir: string, ref: string) {
	if (!ref || ref.startsWith('-')) return null;
	return (await gitTry(dir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]))?.trim() || null;
}

// Every list endpoint takes a `limit`/`page`; this applies them to an array already in memory.
export const slice = <T>(items: T[], p: { offset: number; limit: number }) => items.slice(p.offset, p.offset + p.limit);

export const bool = (v: string | null) => v === 'true' || v === '1';
