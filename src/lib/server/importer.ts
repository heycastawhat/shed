import type { Database } from 'bun:sqlite';
import { git } from './git.js';
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
