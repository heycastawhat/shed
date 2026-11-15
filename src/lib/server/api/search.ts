import type { Database } from 'bun:sqlite';
import { access, atLeast, tokenAccess } from '../access.js';
import { toUser, type UserRow } from '../accounts.js';
import { gitTry } from '../git.js';
import { repoDir, type RepoRow } from '../repos.js';
import { page, route } from './router.js';

// People and organisations by login or name. `kind=org` or `kind=user` narrows it (Shed's own; Forgejo has no such filter).
route('GET', '/users/search', (c) => {
	const q = `%${c.url.searchParams.get('q') ?? ''}%`;
	const kind = c.url.searchParams.get('kind');
	const p = page(c, 50);
	const where = `(login like ? or name like ?) and kind ${kind === 'org' ? "= 'org'" : kind === 'user' ? "= 'user'" : "in ('user', 'org')"}`;
	const total = c.db.query<{ n: number }, [string, string]>(`select count(*) as n from users where ${where}`).get(q, q)!.n;
	const rows = c.db.query<UserRow, [string, string, number, number]>(`select * from users where ${where} order by login limit ? offset ?`).all(q, q, p.limit, p.offset);
	return { ok: true, data: rows.map((u) => ({ ...toUser(u), kind: u.kind })), total };
});

export type CodeHit = { repo: string; ref: string; path: string; line: number; text: string };

// `git grep` over the default branch of every repo this person can read, capped so a common word can't take long.
export async function searchCode(db: Database, root: string, canRead: (r: RepoRow) => boolean, q: string, limit = 100) {
	if (q.trim().length < 2) return [];
	const repos = db
		.query<RepoRow, []>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id order by r.updated_at desc')
		.all()
		.filter(canRead)
		.slice(0, 50);
	const hits: CodeHit[] = [];
	for (const r of repos) {
		if (hits.length >= limit) break;
		const out = await gitTry(repoDir(root, r.id), ['grep', '-n', '-I', '-i', '--fixed-strings', '--max-count=3', '-e', q, r.default_branch, '--']);
		for (const l of out?.split('\n') ?? []) {
			// <ref>:<path>:<line>:<text>; the ref is the branch name we passed, which can't contain ':'.
			const m = l.slice(r.default_branch.length + 1).match(/^(.*?):(\d+):(.*)$/);
			if (m && hits.length < limit) hits.push({ repo: `${r.owner}/${r.name}`, ref: r.default_branch, path: m[1], line: Number(m[2]), text: m[3].slice(0, 300) });
		}
	}
	return hits;
}

// Shed's own: code search, since Forgejo's API has none.
route('GET', '/repos/code/search', async (c) => ({ ok: true, data: await searchCode(c.db, c.root, (r) => atLeast(c.token ? tokenAccess(c.db, c.token, r) : access(c.db, c.user?.id, r), 'read'), c.url.searchParams.get('q') ?? '', Math.min(200, Number(c.url.searchParams.get('limit')) || 100)) }));
