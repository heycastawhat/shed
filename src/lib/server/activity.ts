import type { Database } from 'bun:sqlite';
import type { Feed } from './feed.js';
import { git } from './git.js';
import { onPush } from './push.js';
import { repoDir } from './repos.js';
import { avatar } from './accounts.js';

export function record(db: Database, e: { userId: number; repoId: number | null; op: string; ref?: string; content?: unknown }) {
	db.query('insert into activity (user_id, repo_id, op, ref, content) values (?, ?, ?, ?, ?)').run(
		e.userId,
		e.repoId,
		e.op,
		e.ref ?? '',
		typeof e.content === 'string' ? e.content : JSON.stringify(e.content ?? '')
	);
}

// Pushes become feed events: new commits on a branch (an empty list means a new branch, as in Forgejo's feed), tags, deletions.
onPush(async ({ db, root, repo, userId, updates }) => {
	const dir = repoDir(root, repo.id);
	for (const u of updates) {
		const tag = u.ref.startsWith('refs/tags/');
		if (!u.after) {
			record(db, { userId, repoId: repo.id, op: tag ? 'delete_tag' : 'delete_branch', ref: u.ref });
			continue;
		}
		if (tag) {
			record(db, { userId, repoId: repo.id, op: 'push_tag', ref: u.ref });
			continue;
		}
		// New to the repo: reachable from the new tip but from no other branch (for a new branch) or not from the old tip.
		const others = u.before ? [`^${u.before}`] : ['--not', '--exclude', u.ref, '--branches'];
		const out = await git(dir, ['rev-list', '--max-count=20', '--format=%H%x00%s', u.after, ...others]);
		const commits = out
			.split('\n')
			.filter((l) => l.includes('\0'))
			.map((l) => ({ Sha1: l.split('\0')[0], Message: l.split('\0')[1] }));
		record(db, { userId, repoId: repo.id, op: 'commit_repo', ref: u.ref, content: { Commits: commits } });
	}
});

type Row = { id: number; op: string; ref: string; content: string; created_at: string; login: string; uid: number; name: string; avatar_url: string; repo: string };
const SELECT = `select a.id, a.op, a.ref, a.content, a.created_at, u.id as uid, u.login, u.name, u.avatar_url, o.login || '/' || r.name as repo
	from activity a join users u on u.id = a.user_id join repos r on r.id = a.repo_id join users o on o.id = r.owner_id`;

const toFeed = (r: Row): Feed => ({
	id: r.id,
	op_type: r.op,
	act_user: { id: r.uid, login: r.login, full_name: r.name, avatar_url: avatar(r) },
	repo: { full_name: r.repo },
	ref_name: r.ref,
	content: r.content,
	created: r.created_at
});

// Only events in repos the viewer can see: `visible` is the list of repo ids they may read.
export function repoFeed(db: Database, repoId: number, limit = 50) {
	return db.query<Row, [number, number]>(`${SELECT} where a.repo_id = ? order by a.id desc limit ?`).all(repoId, limit).map(toFeed);
}

export function userFeed(db: Database, userId: number, visible: number[], limit = 40) {
	if (!visible.length) return [];
	return db
		.query<Row, number[]>(`${SELECT} where a.user_id = ? and a.repo_id in (${visible.map(() => '?').join(',')}) order by a.id desc limit ?`)
		.all(userId, ...visible, limit)
		.map(toFeed);
}

export function orgFeed(db: Database, orgId: number, visible: number[], limit = 40) {
	if (!visible.length) return [];
	return db
		.query<Row, number[]>(`${SELECT} where r.owner_id = ? and a.repo_id in (${visible.map(() => '?').join(',')}) order by a.id desc limit ?`)
		.all(orgId, ...visible, limit)
		.map(toFeed);
}

// Contributions in 15-minute buckets, as Forgejo's heatmap API returns them; the page sums them into the viewer's local days.
export function heatmap(db: Database, userId: number) {
	return db
		.query<{ bucket: number; n: number }, [number]>(
			"select cast(strftime('%s', created_at) as integer) / 900 * 900 as bucket, count(*) as n from activity where user_id = ? and created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 year') group by bucket"
		)
		.all(userId)
		.map((r) => ({ timestamp: r.bucket, contributions: r.n }));
}
