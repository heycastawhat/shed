import type { Database } from 'bun:sqlite';
import { git, initBare } from './git.js';
import { createRepo, getRepo, repoDir } from './repos.js';

// Copies repos from a Forgejo (or Gitea) instance: owners (users and orgs, with org members), the repos themselves (every branch
// and tag), descriptions, visibility, default branch and collaborators. Re-running fetches new commits into repos already copied.
// People keep their logins; when they first sign in to Shed with the same email (or username) they take over the imported account.

type FUser = { id: number; login: string; full_name: string; email: string; avatar_url: string; description?: string; website?: string; location?: string; is_admin?: boolean };
type FRepo = {
	full_name: string;
	name: string;
	description: string;
	private: boolean;
	default_branch: string;
	empty: boolean;
	archived: boolean;
	clone_url: string;
	owner: FUser;
};

export function importer(db: Database, root: string, base: string, token: string, log: (s: string) => void = console.log) {
	const api = async <T>(path: string): Promise<T> => {
		const res = await fetch(`${base}/api/v1${path}`, { headers: { authorization: `token ${token}` } });
		if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
		return res.json();
	};
	const pages = async <T>(path: string) => {
		const out: T[] = [];
		for (let page = 1; ; page++) {
			const res: T[] | { data: T[] } = await api(`${path}${path.includes('?') ? '&' : '?'}limit=50&page=${page}`);
			const items = Array.isArray(res) ? res : res.data;
			out.push(...items);
			if (items.length < 50) return out;
		}
	};

	const ids = new Map<string, number>();
	async function account(u: FUser, kind: 'user' | 'org') {
		const key = u.login.toLowerCase();
		if (ids.has(key)) return ids.get(key)!;
		const full = await api<FUser>(`/users/${encodeURIComponent(u.login)}`).catch(() => u);
		const found = db.query<{ id: number }, [string]>('select id from users where login = ?').get(u.login);
		const id =
			found?.id ??
			Number(
				db
					.query('insert into users (login, kind, name, email, description, website, location, admin) values (?, ?, ?, ?, ?, ?, ?, ?)')
					.run(u.login, kind, full.full_name ?? '', kind === 'user' ? full.email || null : null, full.description ?? '', full.website ?? '', full.location ?? '', u.is_admin ? 1 : 0)
					.lastInsertRowid
			);
		if (!found) log(`  + ${kind} ${u.login}`);
		ids.set(key, id);
		if (kind === 'org') {
			for (const m of await pages<FUser>(`/orgs/${encodeURIComponent(u.login)}/members`).catch(() => [])) {
				const uid = await account(m, 'user');
				db.query("insert or ignore into org_members (org_id, user_id, role) values (?, ?, 'member')").run(id, uid);
			}
			// Forgejo's "Owners" team are the org's owners.
			const teams = await api<{ id: number; name: string }[]>(`/orgs/${encodeURIComponent(u.login)}/teams`).catch(() => []);
			const owners = teams.find((t) => t.name === 'Owners');
			if (owners)
				for (const m of await pages<FUser>(`/teams/${owners.id}/members`).catch(() => [])) {
					db.query("update org_members set role = 'owner' where org_id = ? and user_id = ?").run(id, await account(m, 'user'));
				}
		}
		return id;
	}

	type FLabel = { id: number; name: string; color: string; description: string };
	type FMilestone = { id: number; title: string; description: string; state: string; due_on: string | null; closed_at: string | null; created_at?: string };
	type FIssue = { number: number; title: string; body: string; state: string; user: FUser; labels: FLabel[]; assignees: FUser[] | null; milestone: FMilestone | null; created_at: string; updated_at: string; closed_at: string | null; is_locked?: boolean; pull_request: { merged: boolean } | null };
	type FPull = { head: { ref: string; sha: string; repo_id?: number }; base: { ref: string }; merged: boolean; merged_at: string | null; merged_by: FUser | null; merge_commit_sha: string | null; draft: boolean };
	type FComment = { id: number; body: string; user: FUser; created_at: string; updated_at: string };
	type FReview = { id: number; body: string; user: FUser; state: string; commit_id: string; submitted_at: string; dismissed: boolean };
	type FReviewComment = FComment & { path: string; position: number; original_position: number; commit_id: string; diff_hunk: string; resolver: FUser | null };

	// Issues and PRs keep their numbers; existing numbers are skipped, so a re-run only adds what's new.
	async function copyIssues(r: FRepo, repoId: number, dir: string) {
		await git(dir, ['-c', `http.extraHeader=Authorization: token ${token}`, 'fetch', '--quiet', '--force', r.clone_url, '+refs/pull/*/head:refs/pull/*/head']).catch(() => {});
		const labelIds = new Map<number, number>();
		for (const l of await pages<FLabel>(`/repos/${r.full_name}/labels`)) {
			db.query('insert or ignore into labels (repo_id, name, color, description) values (?, ?, ?, ?)').run(repoId, l.name, l.color.replace('#', '').toLowerCase(), l.description ?? '');
			labelIds.set(l.id, db.query<{ id: number }, [number, string]>('select id from labels where repo_id = ? and name = ?').get(repoId, l.name)!.id);
		}
		const msIds = new Map<number, number>();
		for (const m of await pages<FMilestone>(`/repos/${r.full_name}/milestones?state=all`)) {
			db.query('insert or ignore into milestones (repo_id, title, description, state, due_on, closed_at) values (?, ?, ?, ?, ?, ?)').run(repoId, m.title, m.description ?? '', m.state === 'closed' ? 'closed' : 'open', m.due_on, m.closed_at);
			msIds.set(m.id, db.query<{ id: number }, [number, string]>('select id from milestones where repo_id = ? and title = ?').get(repoId, m.title)!.id);
		}
		const issues = (await pages<FIssue>(`/repos/${r.full_name}/issues?state=all&sort=oldest`)).sort((a, b) => a.number - b.number);
		for (const i of issues) {
			if (db.query('select 1 from issues where repo_id = ? and number = ?').get(repoId, i.number)) continue;
			const id = Number(
				db
					.query('insert into issues (repo_id, number, user_id, title, body, state, is_pull, milestone_id, locked, created_at, updated_at, closed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
					.run(repoId, i.number, await account(i.user, 'user'), i.title, i.body ?? '', i.state === 'closed' ? 'closed' : 'open', i.pull_request ? 1 : 0, i.milestone ? (msIds.get(i.milestone.id) ?? null) : null, i.is_locked ? 1 : 0, i.created_at, i.updated_at, i.closed_at)
					.lastInsertRowid
			);
			db.query('update repos set next_number = max(next_number, ?) where id = ?').run(i.number + 1, repoId);
			for (const l of i.labels ?? []) if (labelIds.has(l.id)) db.query('insert or ignore into issue_labels (issue_id, label_id) values (?, ?)').run(id, labelIds.get(l.id)!);
			for (const a of i.assignees ?? []) db.query('insert or ignore into assignees (issue_id, user_id) values (?, ?)').run(id, await account(a, 'user'));
			db.query('insert or ignore into subscriptions (user_id, issue_id) values (?, ?)').run(await account(i.user, 'user'), id);
			for (const cm of await pages<FComment>(`/repos/${r.full_name}/issues/${i.number}/comments`))
				db.query('insert into comments (issue_id, user_id, body, created_at, updated_at) values (?, ?, ?, ?, ?)').run(id, await account(cm.user, 'user'), cm.body, cm.created_at, cm.updated_at);
			if (i.pull_request) {
				const p = await api<FPull>(`/repos/${r.full_name}/pulls/${i.number}`);
				const base = (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${p.base.ref}`]).catch(() => '')).trim();
				const mb = base ? (await git(dir, ['merge-base', base, p.head.sha]).catch(() => '')).trim() || null : null;
				db.query('insert into pulls (issue_id, base, head, head_sha, merge_base, draft, merged_at, merged_by, merge_commit) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
					id,
					p.base.ref,
					p.head.ref.startsWith('refs/pull/') ? `pr-${i.number}` : p.head.ref,
					p.head.sha,
					mb,
					p.draft ? 1 : 0,
					p.merged ? p.merged_at : null,
					p.merged_by ? await account(p.merged_by, 'user') : null,
					p.merge_commit_sha
				);
				db.query('insert into revisions (issue_id, head_sha, created_at) values (?, ?, ?)').run(id, p.head.sha, i.created_at);
				for (const rv of await pages<FReview>(`/repos/${r.full_name}/pulls/${i.number}/reviews`)) {
					const state = ['APPROVED', 'REQUEST_CHANGES', 'COMMENT'].includes(rv.state) ? rv.state : 'COMMENT';
					const rid = Number(
						db.query('insert into reviews (issue_id, user_id, state, body, commit_sha, dismissed, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, await account(rv.user, 'user'), state, rv.body ?? '', rv.commit_id ?? '', rv.dismissed ? 1 : 0, rv.submitted_at).lastInsertRowid
					);
					for (const lc of await api<FReviewComment[]>(`/repos/${r.full_name}/pulls/${i.number}/reviews/${rv.id}/comments`).catch(() => []))
						db.query('insert into comments (issue_id, user_id, body, review_id, path, side, line, commit_sha, diff_hunk, resolved_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
							id,
							await account(lc.user, 'user'),
							lc.body,
							rid,
							lc.path,
							lc.position ? 'new' : 'old',
							lc.position || lc.original_position,
							lc.commit_id,
							lc.diff_hunk,
							lc.resolver ? await account(lc.resolver, 'user') : null,
							lc.created_at,
							lc.updated_at
						);
				}
			}
		}
		log(`  ${issues.length} issues and pull requests`);
	}

	type FRelease = { tag_name: string; target_commitish: string; name: string; body: string; draft: boolean; prerelease: boolean; author: FUser; created_at: string; published_at: string; assets: { name: string; browser_download_url: string; download_count: number }[] };
	async function copyReleases(r: FRepo, repoId: number) {
		const { mkdir } = await import('node:fs/promises');
		for (const x of await pages<FRelease>(`/repos/${r.full_name}/releases?draft=true`).catch(() => [])) {
			if (db.query('select 1 from releases where repo_id = ? and tag = ?').get(repoId, x.tag_name)) continue;
			const id = Number(
				db
					.query('insert into releases (repo_id, tag, target, name, body, draft, prerelease, user_id, created_at, published_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
					.run(repoId, x.tag_name, x.target_commitish, x.name, x.body ?? '', x.draft ? 1 : 0, x.prerelease ? 1 : 0, await account(x.author, 'user'), x.created_at, x.draft ? null : x.published_at)
					.lastInsertRowid
			);
			for (const a of x.assets ?? []) {
				const res = await fetch(a.browser_download_url, { headers: { authorization: `token ${token}` } });
				if (!res.ok) continue;
				const uuid = crypto.randomUUID();
				const path = `${root}/attachments/${uuid.slice(0, 2)}/${uuid}`;
				await mkdir(path.replace(/\/[^/]+$/, ''), { recursive: true });
				const size = await Bun.write(path, res);
				db.query('insert into release_assets (release_id, name, size, uuid, download_count) values (?, ?, ?, ?, ?)').run(id, a.name, size, uuid, a.download_count ?? 0);
			}
		}
	}

	async function copyWiki(r: FRepo, dir: string) {
		const { existsSync } = await import('node:fs');
		const wiki = dir.replace(/\.git$/, '.wiki.git');
		const remote = r.clone_url.replace(/\.git$/, '.wiki.git');
		const probe = await fetch(`${remote}/info/refs?service=git-upload-pack`, { headers: { authorization: `token ${token}` } });
		if (!probe.ok) return;
		if (!existsSync(wiki)) await initBare(wiki, 'main');
		// Forgejo's wiki branch may be master or main; Shed keeps it as main.
		await git(wiki, ['-c', `http.extraHeader=Authorization: token ${token}`, 'fetch', '--quiet', '--force', remote, '+refs/heads/*:refs/remotes/origin/*']).catch(() => {});
		const tip = (await git(wiki, ['for-each-ref', '--format=%(refname)', '--count=1', 'refs/remotes/origin']).catch(() => '')).trim();
		if (tip) await git(wiki, ['update-ref', 'refs/heads/main', tip]);
		log('  wiki');
	}

	return async function run(only?: string[]) {
		const me = await api<FUser>('/user');
		await account(me, 'user');
		const repos = (await pages<FRepo>('/repos/search?')).filter((r) => !only?.length || only.includes(r.full_name));
		for (const r of repos) {
			const kind = (await api(`/orgs/${encodeURIComponent(r.owner.login)}`).then(() => true, () => false)) ? 'org' : 'user';
			const ownerId = await account(r.owner, kind);
			let row = getRepo(db, r.owner.login, r.name);
			if (!row) {
				await createRepo(db, root, ownerId, { name: r.name, description: r.description, private: r.private, defaultBranch: r.default_branch || 'main' });
				row = getRepo(db, r.owner.login, r.name)!;
				log(`+ ${r.full_name}`);
			} else log(`~ ${r.full_name}`);
			db.query('update repos set description = ?, private = ?, archived = ? where id = ?').run(r.description, r.private ? 1 : 0, r.archived ? 1 : 0, row.id);
			const dir = repoDir(root, row.id);
			if (!r.empty) {
				// Branches and tags only: Forgejo's refs/pull/* belong to its PRs, which are imported separately.
				await git(dir, ['-c', `http.extraHeader=Authorization: token ${token}`, 'fetch', '--quiet', '--prune', '--force', r.clone_url, '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);
				if (r.default_branch) {
					await git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${r.default_branch}`]);
					db.query('update repos set default_branch = ? where id = ?').run(r.default_branch, row.id);
				}
			}
			await copyIssues(r, row.id, dir);
			await copyReleases(r, row.id);
			await copyWiki(r, dir);
			const collaborators = await pages<FUser & { permissions?: { admin: boolean; push: boolean } }>(`/repos/${r.full_name}/collaborators`).catch(() => []);
			for (const c of collaborators) {
				const uid = await account(c, 'user');
				if (uid === ownerId) continue;
				const level = c.permissions?.admin ? 'admin' : c.permissions?.push ? 'write' : 'read';
				db.query('insert into collaborators (repo_id, user_id, permission) values (?, ?, ?) on conflict do update set permission = excluded.permission').run(row.id, uid, level);
			}
		}
		return repos.length;
	};
}
