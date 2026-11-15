import { error } from '@sveltejs/kit';
import { access, atLeast } from '../access.js';
import { toUser, type UserRow } from '../accounts.js';
import { heatmap, orgFeed, record, repoFeed, userFeed } from '../activity.js';
import * as browse from '../browse.js';
import { git } from '../git.js';
import { render } from '../markdown.js';
import { afterPush, refSnapshot } from '../push.js';
import { createRepo, getRepo, type RepoRow } from '../repos.js';
import { commitFiles, type Change } from '../write.js';
import { bool, now, refSha, repoJson, repoOf, slice, userByLogin, userJson, userRow } from './common.js';
import { labelJson, milestoneJson, type LabelRow, type MilestoneRow } from './shapes.js';
import { me, page, Paged, route, type Ctx } from './router.js';

const ALL_REPOS = 'select r.*, u.login as owner from repos r join users u on u.id = r.owner_id';
const visible = (c: Ctx, rows: RepoRow[]) => rows.filter((r) => atLeast(access(c.db, c.user?.id, r), 'read'));
const repos = (c: Ctx, where = '', ...args: (string | number)[]) =>
	visible(c, c.db.query<RepoRow, (string | number)[]>(`${ALL_REPOS} ${where} order by r.updated_at desc`).all(...args));

// --- users and orgs ---

route('GET', '/user', (c) => ({ ...toUser(me(c)), email: me(c).email ?? '', is_admin: !!me(c).admin, username: me(c).login }));
route('GET', '/users/:name', (c) => {
	const u = userByLogin(c.db, c.params.name) ?? error(404, 'User not found');
	return { ...toUser(u), description: (u as UserRow & { description: string }).description, created: (u as UserRow & { created_at: string }).created_at };
});
route('GET', '/user/repos', async (c) => {
	const u = me(c);
	const mine = repos(c).filter((r) => r.owner_id === u.id || atLeast(access(c.db, u.id, r), 'write') || r.owner_id === u.id);
	const p = page(c);
	return new Paged(await Promise.all(slice(mine, p).map((r) => repoJson(c, r))), mine.length);
});
route('GET', '/users/:name/repos', async (c) => {
	const u = userByLogin(c.db, c.params.name) ?? error(404, 'User not found');
	const list = repos(c, 'where r.owner_id = ?', u.id);
	return new Paged(await Promise.all(slice(list, page(c)).map((r) => repoJson(c, r))), list.length);
});
route('GET', '/orgs/:name/repos', async (c) => {
	const u = userByLogin(c.db, c.params.name) ?? error(404, 'Organization not found');
	const list = repos(c, 'where r.owner_id = ?', u.id);
	return new Paged(await Promise.all(slice(list, page(c)).map((r) => repoJson(c, r))), list.length);
});
route('GET', '/repos/search', async (c) => {
	const q = (c.url.searchParams.get('q') ?? '').toLowerCase();
	const list = repos(c).filter((r) => !q || `${r.owner}/${r.name} ${r.description}`.toLowerCase().includes(q));
	return { ok: true, data: await Promise.all(slice(list, page(c)).map((r) => repoJson(c, r))) };
});
route('GET', '/orgs/:name', (c) => {
	const u = c.db.query<UserRow, [string]>("select * from users where login = ? and kind = 'org'").get(c.params.name) ?? error(404, 'Organization not found');
	return { ...toUser(u), username: u.login, name: u.login };
});
route('GET', '/orgs/:name/members', (c) => {
	const org = c.db.query<UserRow, [string]>("select * from users where login = ? and kind = 'org'").get(c.params.name) ?? error(404, 'Organization not found');
	return c.db.query<UserRow, [number]>('select u.* from users u join org_members m on m.user_id = u.id where m.org_id = ? order by u.login').all(org.id).map(toUser);
});
route('GET', '/user/orgs', (c) =>
	c.db
		.query<UserRow, [number]>('select u.* from users u join org_members m on m.org_id = u.id where m.user_id = ? order by u.login')
		.all(me(c).id)
		.map((u) => ({ ...toUser(u), username: u.login, name: u.login }))
);
route('GET', '/users/:name/orgs', (c) => {
	const u = userByLogin(c.db, c.params.name) ?? error(404, 'User not found');
	return c.db
		.query<UserRow, [number]>("select u.* from users u join org_members m on m.org_id = u.id where m.user_id = ? and u.kind = 'org' order by u.login")
		.all(u.id)
		.map((g) => ({ ...toUser(g), username: g.login, name: g.login }));
});
route('GET', '/users/:name/heatmap', (c) => heatmap(c.db, (userByLogin(c.db, c.params.name) ?? error(404, 'User not found')).id));
route('GET', '/users/:name/activities/feeds', (c) => {
	const u = userByLogin(c.db, c.params.name) ?? error(404, 'User not found');
	return userFeed(c.db, u.id, repos(c).map((r) => r.id), page(c).limit);
});
route('GET', '/orgs/:name/activities/feeds', (c) => {
	const u = userByLogin(c.db, c.params.name) ?? error(404, 'Organization not found');
	return orgFeed(c.db, u.id, repos(c).map((r) => r.id), page(c).limit);
});

// --- repos ---

route('GET', '/repos/:owner/:repo', async (c) => repoJson(c, repoOf(c).row));
route('POST', '/user/repos', async (c) => createFor(c, me(c).id));
route('POST', '/orgs/:org/repos', async (c) => {
	const org = c.db.query<UserRow, [string]>("select * from users where login = ? and kind = 'org'").get(c.params.org) ?? error(404, 'Organization not found');
	if (!c.db.query('select 1 from org_members where org_id = ? and user_id = ?').get(org.id, me(c).id)) error(403, `You're not a member of ${org.login}`);
	return createFor(c, org.id);
});
async function createFor(c: Ctx, ownerId: number) {
	const b = await c.body<{ name: string; description?: string; private?: boolean; default_branch?: string; auto_init?: boolean }>();
	const branch = b.default_branch || 'main';
	const id = await createRepo(c.db, c.root, ownerId, { name: b.name, description: b.description, private: b.private !== false, defaultBranch: branch });
	const u = me(c);
	if (b.auto_init) {
		const { repoDir } = await import('../repos.js');
		await commitFiles(repoDir(c.root, id), {
			branch,
			parent: null,
			changes: [{ path: 'README.md', content: `# ${b.name}\n${b.description ? `\n${b.description}\n` : ''}` }],
			message: 'Initial commit',
			author: { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` }
		});
	}
	record(c.db, { userId: u.id, repoId: id, op: 'create_repo' });
	const row = c.db.query<RepoRow, [number]>(`${ALL_REPOS} where r.id = ?`).get(id)!;
	return repoJson(c, row);
}
route('PATCH', '/repos/:owner/:repo', async (c) => {
	const { row } = repoOf(c, 'admin');
	const b = await c.body<Record<string, unknown>>();
	const set: Record<string, unknown> = {};
	if (typeof b.description === 'string') set.description = b.description;
	if (typeof b.private === 'boolean') set.private = b.private ? 1 : 0;
	if (typeof b.archived === 'boolean') set.archived = b.archived ? 1 : 0;
	if (typeof b.has_issues === 'boolean') set.has_issues = b.has_issues ? 1 : 0;
	if (typeof b.has_wiki === 'boolean') set.has_wiki = b.has_wiki ? 1 : 0;
	if (typeof b.default_merge_style === 'string') set.default_merge_style = b.default_merge_style;
	if (typeof b.default_delete_branch_after_merge === 'boolean') set.delete_branch_after_merge = b.default_delete_branch_after_merge ? 1 : 0;
	if (typeof b.default_branch === 'string') {
		const dir = repoOf(c).dir;
		if (!(await refSha(dir, `refs/heads/${b.default_branch}`))) error(422, `There's no branch called ${b.default_branch}`);
		await git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${b.default_branch}`]);
		set.default_branch = b.default_branch;
	}
	if (typeof b.name === 'string' && b.name !== row.name) {
		const { checkName } = await import('../repos.js');
		checkName(b.name, 'Repo name');
		if (getRepo(c.db, row.owner, b.name)) error(409, `A repo called ${b.name} already exists`);
		set.name = b.name;
	}
	const styles = ['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only'] as const;
	const flags = { allow_merge_commits: 'merge', allow_rebase: 'rebase', allow_rebase_explicit: 'rebase-merge', allow_squash_merge: 'squash', allow_fast_forward_only_merge: 'fast-forward-only' } as const;
	if (Object.keys(flags).some((k) => typeof b[k] === 'boolean')) {
		const cur: string[] = JSON.parse(c.db.query<{ merge_styles: string }, [number]>('select merge_styles from repos where id = ?').get(row.id)!.merge_styles);
		const next = styles.filter((s) => {
			const k = (Object.keys(flags) as (keyof typeof flags)[]).find((f) => flags[f] === s)!;
			return typeof b[k] === 'boolean' ? b[k] : cur.includes(s);
		});
		set.merge_styles = JSON.stringify(next);
	}
	for (const [k, v] of Object.entries(set)) c.db.query(`update repos set ${k} = ? where id = ?`).run(v as string, row.id);
	return repoJson(c, c.db.query<RepoRow, [number]>(`${ALL_REPOS} where r.id = ?`).get(row.id)!);
});
route('DELETE', '/repos/:owner/:repo', async (c) => {
	const { row } = repoOf(c, 'admin');
	const { deleteRepo } = await import('../repos.js');
	await deleteRepo(c.db, c.root, row.id);
});

// --- branches, tags, commits ---

async function branchJson(c: Ctx, r: ReturnType<typeof repoOf>, b: browse.RefInfo) {
	const { protectionFor } = await import('./protect.js');
	const p = protectionFor(c.db, r.row.id, b.name);
	return {
		name: b.name,
		commit: { id: b.sha, message: b.subject, timestamp: b.date, author: { name: b.author, email: b.email, username: '' } },
		protected: !!p,
		user_can_push: atLeast(r.level, 'write') && (!p || p.push === 'all' || (p.push === 'admins' && r.level === 'admin')),
		effective_branch_protection_name: p?.pattern ?? ''
	};
}
route('GET', '/repos/:owner/:repo/branches', async (c) => {
	const r = repoOf(c);
	const list = await browse.branches(r.dir);
	return new Paged(await Promise.all(slice(list, page(c, 100)).map((b) => branchJson(c, r, b))), list.length);
});
route('GET', '/repos/:owner/:repo/branches/*branch', async (c) => {
	const r = repoOf(c);
	const b = (await browse.branches(r.dir)).find((b) => b.name === c.params.branch) ?? error(404, 'Branch not found');
	return branchJson(c, r, b);
});
route('POST', '/repos/:owner/:repo/branches', async (c) => {
	const r = repoOf(c, 'write');
	const b = await c.body<{ new_branch_name: string; old_ref_name?: string; old_branch_name?: string }>();
	if (!/^[A-Za-z0-9._/-]{1,200}$/.test(b.new_branch_name ?? '') || b.new_branch_name.includes('..') || b.new_branch_name.startsWith('-')) error(422, 'Invalid branch name');
	const from = (await refSha(r.dir, b.old_ref_name || b.old_branch_name || r.row.default_branch)) ?? error(404, 'Starting point not found');
	const before = await refSnapshot(r.dir);
	await git(r.dir, ['update-ref', `refs/heads/${b.new_branch_name}`, from, '0'.repeat(40)]).catch(() => error(409, `${b.new_branch_name} already exists`));
	await afterPush(c.db, c.root, r.row, me(c).id, before);
	return branchJson(c, r, (await browse.branches(r.dir)).find((x) => x.name === b.new_branch_name)!);
});
route('DELETE', '/repos/:owner/:repo/branches/*branch', async (c) => {
	const r = repoOf(c, 'write');
	const name = c.params.branch;
	if (name === r.row.default_branch) error(403, `${name} is the default branch`);
	const { protectionFor } = await import('./protect.js');
	if (protectionFor(c.db, r.row.id, name)) error(403, `${name} is protected`);
	const sha = (await refSha(r.dir, `refs/heads/${name}`)) ?? error(404, 'Branch not found');
	const before = await refSnapshot(r.dir);
	await git(r.dir, ['update-ref', '-d', `refs/heads/${name}`, sha]);
	await afterPush(c.db, c.root, r.row, me(c).id, before);
});
route('GET', '/repos/:owner/:repo/tags', async (c) => {
	const r = repoOf(c);
	const list = await browse.tags(r.dir);
	const base = `${c.origin}/${r.full}/archive`;
	return new Paged(
		slice(list, page(c, 100)).map((t) => ({
			name: t.name,
			message: t.message,
			id: t.sha,
			commit: { sha: t.sha, created: t.date },
			zipball_url: `${base}/${encodeURIComponent(t.name)}.zip`,
			tarball_url: `${base}/${encodeURIComponent(t.name)}.tar.gz`
		})),
		list.length
	);
});
route('POST', '/repos/:owner/:repo/tags', async (c) => {
	const r = repoOf(c, 'write');
	const b = await c.body<{ tag_name: string; target?: string; message?: string }>();
	if (!/^[A-Za-z0-9._/-]{1,200}$/.test(b.tag_name ?? '') || b.tag_name.includes('..') || b.tag_name.startsWith('-')) error(422, 'Invalid tag name');
	const sha = (await refSha(r.dir, b.target || r.row.default_branch)) ?? error(404, 'Target not found');
	const before = await refSnapshot(r.dir);
	const u = me(c);
	if (b.message)
		await git(r.dir, ['tag', '-a', '-m', b.message, b.tag_name, sha], undefined, { GIT_COMMITTER_NAME: u.name || u.login, GIT_COMMITTER_EMAIL: u.email ?? `${u.login}@users.noreply` });
	else await git(r.dir, ['update-ref', `refs/tags/${b.tag_name}`, sha, '0'.repeat(40)]).catch(() => error(409, 'That tag exists'));
	await afterPush(c.db, c.root, r.row, u.id, before);
	return { name: b.tag_name, id: sha, commit: { sha } };
});
route('DELETE', '/repos/:owner/:repo/tags/*tag', async (c) => {
	const r = repoOf(c, 'write');
	const before = await refSnapshot(r.dir);
	await git(r.dir, ['update-ref', '-d', `refs/tags/${c.params.tag}`]).catch(() => error(404, 'Tag not found'));
	await afterPush(c.db, c.root, r.row, me(c).id, before);
});

export function commitsJson(c: Ctx, full: string, list: browse.CommitInfo[]) {
	const { toCommits } = { toCommits: commitAuthors };
	return toCommits(c, list).map((x, i) => ({
		...x,
		html_url: `${c.origin}/${full}/commit/${list[i].sha}`,
		commit: { ...x.commit, committer: { name: list[i].committer, email: list[i].committerEmail, date: list[i].committed }, author: { ...x.commit.author, email: list[i].email } },
		committer: x.author,
		created: list[i].date
	}));
}
function commitAuthors(c: Ctx, commits: browse.CommitInfo[]) {
	const emails = [...new Set(commits.map((x) => x.email.toLowerCase()))];
	const users = emails.length ? c.db.query<UserRow, string[]>(`select * from users where lower(email) in (${emails.map(() => '?').join(',')})`).all(...emails) : [];
	const byEmail = new Map(users.map((u) => [u.email!.toLowerCase(), toUser(u)]));
	return commits.map((x) => ({
		sha: x.sha,
		commit: { message: x.message, author: { name: x.author, date: x.date } },
		author: byEmail.get(x.email.toLowerCase()) ?? null,
		parents: x.parents.map((sha) => ({ sha }))
	}));
}
route('GET', '/repos/:owner/:repo/commits', async (c) => {
	const r = repoOf(c);
	const sha = (await refSha(r.dir, c.url.searchParams.get('sha') || r.row.default_branch)) ?? error(404, 'Ref not found');
	const p = page(c);
	const path = c.url.searchParams.get('path') ?? undefined;
	const [list, total] = await Promise.all([browse.log(r.dir, sha, { skip: p.offset, limit: p.limit, path }), browse.count(r.dir, sha, path)]);
	return new Paged(commitsJson(c, r.full, list), total);
});
route('GET', '/repos/:owner/:repo/git/commits/:sha', async (c) => {
	const r = repoOf(c);
	if (c.params.sha.endsWith('.diff') || c.params.sha.endsWith('.patch')) {
		const sha = (await refSha(r.dir, c.params.sha.replace(/\.(diff|patch)$/, ''))) ?? error(404, 'Commit not found');
		return new Response(await browse.commitDiff(r.dir, sha), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
	const sha = (await refSha(r.dir, c.params.sha)) ?? error(404, 'Commit not found');
	return commitsJson(c, r.full, [await browse.commit(r.dir, sha)])[0];
});
route('GET', '/repos/:owner/:repo/commits/:ref/status', async (c) => {
	const r = repoOf(c);
	const sha = (await refSha(r.dir, c.params.ref)) ?? error(404, 'Ref not found');
	const { combinedStatus } = await import('./statuses.js');
	return combinedStatus(c, r.row.id, sha);
});
route('GET', '/repos/:owner/:repo/compare/*spec', async (c) => {
	const r = repoOf(c);
	const [from, to] = c.params.spec.split('...');
	const [a, b] = await Promise.all([refSha(r.dir, from), refSha(r.dir, to ?? '')]);
	if (!a || !b) error(404, 'Ref not found');
	const base = (await browse.mergeBase(r.dir, a, b)) ?? a;
	const list = (await git(r.dir, ['rev-list', '--reverse', '--max-count=250', `${base}..${b}`])).split('\n').filter(Boolean);
	const commits = await Promise.all(list.map((s) => browse.commit(r.dir, s)));
	const files = (await git(r.dir, ['diff', '--name-status', '--find-renames', base, b]))
		.split('\n')
		.filter(Boolean)
		.map((l) => {
			const [st, ...paths] = l.split('\t');
			return { filename: paths.at(-1)!, previous_filename: paths.length > 1 ? paths[0] : undefined, status: { A: 'added', D: 'deleted', M: 'changed', R: 'renamed' }[st[0]] ?? 'changed' };
		});
	return { total_commits: list.length, commits: commitsJson(c, r.full, commits), files, merge_base_commit: base };
});

// --- files ---

route('GET', '/repos/:owner/:repo/raw/*path', async (c) => {
	const r = repoOf(c);
	const sha = (await refSha(r.dir, c.url.searchParams.get('ref') || r.row.default_branch)) ?? error(404, 'Ref not found');
	if ((await browse.objectType(r.dir, sha, c.params.path)) !== 'blob') error(404, 'File not found');
	return new Response(await browse.readBlob(r.dir, sha, c.params.path), { headers: { 'content-type': 'application/octet-stream' } });
});
async function contentsJson(c: Ctx, r: ReturnType<typeof repoOf>, sha: string, path: string, ref: string) {
	const type = await browse.objectType(r.dir, sha, path);
	if (type === 'tree' || !path) {
		const entries = (await browse.tree(r.dir, sha, path)) ?? error(404, 'Not found');
		return entries.map((e) => ({ name: e.name, path: e.path, sha: e.sha, type: e.type, size: e.size, content: null, encoding: null, url: '', html_url: `${c.origin}/${r.full}/${e.type === 'dir' ? 'tree' : 'blob'}/${encodeURIComponent(ref)}/${e.path}` }));
	}
	if (type !== 'blob') error(404, `${path} doesn't exist`);
	const size = await browse.blobSize(r.dir, sha, path);
	const blobSha = (await git(r.dir, ['rev-parse', `${sha}:${path}`])).trim();
	const bytes = size <= 1024 * 1024 ? await browse.readBlob(r.dir, sha, path) : null;
	return { name: path.split('/').pop(), path, sha: blobSha, type: 'file', size, encoding: bytes ? 'base64' : null, content: bytes ? bytes.toBase64() : null, last_commit_sha: sha };
}
route('GET', '/repos/:owner/:repo/contents', async (c) => {
	const r = repoOf(c);
	const ref = c.url.searchParams.get('ref') || r.row.default_branch;
	return contentsJson(c, r, (await refSha(r.dir, ref)) ?? error(404, 'Ref not found'), '', ref);
});
route('GET', '/repos/:owner/:repo/contents/*path', async (c) => {
	const r = repoOf(c);
	const ref = c.url.searchParams.get('ref') || r.row.default_branch;
	return contentsJson(c, r, (await refSha(r.dir, ref)) ?? error(404, 'Ref not found'), c.params.path, ref);
});

// Create (POST), update (PUT) or delete (DELETE) one file in a commit. `sha` is the file's current blob, so a stale edit is refused.
async function writeFile(c: Ctx, mode: 'create' | 'update' | 'delete') {
	const r = repoOf(c, 'write');
	const b = await c.body<{ content?: string; message?: string; branch?: string; new_branch?: string; sha?: string; from_path?: string }>();
	const u = me(c);
	const branch = b.branch || r.row.default_branch;
	const target = b.new_branch || branch;
	const parent = await refSha(r.dir, `refs/heads/${branch}`);
	if (!parent && !(await browse.isEmpty(r.dir))) error(404, `There's no branch called ${branch}`);
	if (b.new_branch && (await refSha(r.dir, `refs/heads/${b.new_branch}`))) error(409, `${b.new_branch} already exists`);
	const path = c.params.path;
	const current = parent ? await git(r.dir, ['rev-parse', '--verify', '--quiet', `${parent}:${path}`]).then((s) => s.trim(), () => null) : null;
	if (mode === 'create' && current) error(422, `${path} already exists`);
	if (mode !== 'create' && !current && !b.from_path) error(404, `${path} doesn't exist`);
	if (mode !== 'create' && b.sha && current && b.sha !== current) error(409, `${path} changed since you opened it`);
	const changes: Change[] = mode === 'delete' ? [{ path, content: null }] : [{ path, content: Uint8Array.fromBase64(b.content ?? '') as Uint8Array<ArrayBuffer> }];
	if (b.from_path && b.from_path !== path) changes.push({ path: b.from_path, content: null });
	const before = await refSnapshot(r.dir);
	const sha = await commitFiles(r.dir, {
		branch: target,
		parent,
		newBranch: !!b.new_branch,
		changes,
		message: b.message || `${mode === 'create' ? 'Add' : mode === 'update' ? 'Update' : 'Delete'} ${path}`,
		author: { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` }
	}).catch((e) => error(409, String(e.message ?? e)));
	await afterPush(c.db, c.root, r.row, u.id, before);
	return { commit: { sha, html_url: `${c.origin}/${r.full}/commit/${sha}` }, content: mode === 'delete' ? null : { path, name: path.split('/').pop() } };
}
route('POST', '/repos/:owner/:repo/contents/*path', (c) => writeFile(c, 'create'));
route('PUT', '/repos/:owner/:repo/contents/*path', (c) => writeFile(c, 'update'));
route('DELETE', '/repos/:owner/:repo/contents/*path', (c) => writeFile(c, 'delete'));

// --- people on a repo ---

function people(c: Ctx, r: ReturnType<typeof repoOf>) {
	const ids = new Set<number>([r.row.owner_id]);
	for (const x of c.db.query<{ user_id: number }, [number]>('select user_id from collaborators where repo_id = ?').all(r.row.id)) ids.add(x.user_id);
	for (const x of c.db.query<{ user_id: number }, [number]>('select user_id from org_members where org_id = ?').all(r.row.owner_id)) ids.add(x.user_id);
	return [...ids].map((id) => userRow(c.db, id)).filter((u) => u.kind === 'user');
}
route('GET', '/repos/:owner/:repo/assignees', (c) => people(c, repoOf(c)).filter((u) => atLeast(access(c.db, u.id, repoOf(c).row), 'write')).map(toUser));
route('GET', '/repos/:owner/:repo/collaborators', (c) => {
	const r = repoOf(c);
	return c.db
		.query<UserRow & { permission: string }, [number]>('select u.*, c.permission from users u join collaborators c on c.user_id = u.id where c.repo_id = ? order by u.login')
		.all(r.row.id)
		.map((u) => ({ ...toUser(u), permissions: { admin: u.permission === 'admin', push: u.permission !== 'read', pull: true } }));
});
route('GET', '/repos/:owner/:repo/collaborators/:user/permission', (c) => {
	const r = repoOf(c);
	const u = userByLogin(c.db, c.params.user) ?? error(404, 'User not found');
	const level = access(c.db, u.id, r.row);
	return { permission: level, role_name: level, user: toUser(u) };
});
route('PUT', '/repos/:owner/:repo/collaborators/:user', async (c) => {
	const r = repoOf(c, 'admin');
	const u = userByLogin(c.db, c.params.user) ?? error(404, 'User not found');
	const p = (await c.body<{ permission?: string }>()).permission ?? 'write';
	if (!['read', 'write', 'admin'].includes(p)) error(422, 'permission must be read, write or admin');
	c.db.query('insert into collaborators (repo_id, user_id, permission) values (?, ?, ?) on conflict do update set permission = excluded.permission').run(r.row.id, u.id, p);
});
route('DELETE', '/repos/:owner/:repo/collaborators/:user', (c) => {
	const r = repoOf(c, 'admin');
	const u = userByLogin(c.db, c.params.user) ?? error(404, 'User not found');
	c.db.query('delete from collaborators where repo_id = ? and user_id = ?').run(r.row.id, u.id);
});

// --- labels and milestones ---

route('GET', '/repos/:owner/:repo/labels', (c) => {
	const list = c.db.query<LabelRow, [number]>('select * from labels where repo_id = ? order by name').all(repoOf(c).row.id).map(labelJson);
	return new Paged(slice(list, page(c, 50)), list.length);
});
const color = (v: unknown) => {
	const s = String(v ?? '').replace(/^#/, '');
	if (!/^[0-9a-f]{6}$/i.test(s)) error(422, 'Colour must be a hex code like #ee0701');
	return s.toLowerCase();
};
route('POST', '/repos/:owner/:repo/labels', async (c) => {
	const r = repoOf(c, 'write');
	const b = await c.body<{ name: string; color: string; description?: string }>();
	if (!b.name?.trim()) error(422, 'Give the label a name');
	const id = Number(
		c.db
			.query('insert into labels (repo_id, name, color, description) values (?, ?, ?, ?)')
			.run(r.row.id, b.name.trim(), color(b.color), b.description ?? '')
			.lastInsertRowid
	);
	return labelJson(c.db.query<LabelRow, [number]>('select * from labels where id = ?').get(id)!);
});
route('PATCH', '/repos/:owner/:repo/labels/:id', async (c) => {
	const r = repoOf(c, 'write');
	const b = await c.body<{ name?: string; color?: string; description?: string }>();
	const l = c.db.query<LabelRow, [number, number]>('select * from labels where id = ? and repo_id = ?').get(Number(c.params.id), r.row.id) ?? error(404, 'Label not found');
	c.db.query('update labels set name = ?, color = ?, description = ? where id = ?').run(b.name?.trim() || l.name, b.color ? color(b.color) : l.color, b.description ?? l.description, l.id);
	return labelJson(c.db.query<LabelRow, [number]>('select * from labels where id = ?').get(l.id)!);
});
route('DELETE', '/repos/:owner/:repo/labels/:id', (c) => {
	c.db.query('delete from labels where id = ? and repo_id = ?').run(Number(c.params.id), repoOf(c, 'write').row.id);
});
route('GET', '/repos/:owner/:repo/milestones', (c) => {
	const state = c.url.searchParams.get('state') ?? 'open';
	const list = c.db
		.query<MilestoneRow, [number]>('select * from milestones where repo_id = ? order by due_on is null, due_on, title')
		.all(repoOf(c).row.id)
		.filter((m) => state === 'all' || m.state === state)
		.map((m) => milestoneJson(c.db, m));
	return new Paged(slice(list, page(c, 50)), list.length);
});
route('POST', '/repos/:owner/:repo/milestones', async (c) => {
	const r = repoOf(c, 'write');
	const b = await c.body<{ title: string; description?: string; due_on?: string }>();
	if (!b.title?.trim()) error(422, 'Give the milestone a title');
	const id = Number(c.db.query('insert into milestones (repo_id, title, description, due_on) values (?, ?, ?, ?)').run(r.row.id, b.title.trim(), b.description ?? '', b.due_on ?? null).lastInsertRowid);
	return milestoneJson(c.db, c.db.query<MilestoneRow, [number]>('select * from milestones where id = ?').get(id)!);
});
route('PATCH', '/repos/:owner/:repo/milestones/:id', async (c) => {
	const r = repoOf(c, 'write');
	const m = c.db.query<MilestoneRow, [number, number]>('select * from milestones where id = ? and repo_id = ?').get(Number(c.params.id), r.row.id) ?? error(404, 'Milestone not found');
	const b = await c.body<{ title?: string; description?: string; due_on?: string | null; state?: 'open' | 'closed' }>();
	const state = b.state ?? m.state;
	c.db
		.query('update milestones set title = ?, description = ?, due_on = ?, state = ?, closed_at = ? where id = ?')
		.run(b.title?.trim() || m.title, b.description ?? m.description, b.due_on === undefined ? m.due_on : b.due_on, state, state === 'closed' ? (m.closed_at ?? now()) : null, m.id);
	return milestoneJson(c.db, c.db.query<MilestoneRow, [number]>('select * from milestones where id = ?').get(m.id)!);
});
route('DELETE', '/repos/:owner/:repo/milestones/:id', (c) => {
	c.db.query('delete from milestones where id = ? and repo_id = ?').run(Number(c.params.id), repoOf(c, 'write').row.id);
});

// --- stars, watching, activity ---

route('GET', '/repos/:owner/:repo/activities/feeds', (c) => repoFeed(c.db, repoOf(c).row.id, page(c, 50).limit));
route('GET', '/user/starred/:owner/:repo', (c) => (c.db.query('select 1 from stars where user_id = ? and repo_id = ?').get(me(c).id, repoOf(c).row.id) ? undefined : error(404, 'Not starred')));
route('PUT', '/user/starred/:owner/:repo', (c) => {
	c.db.query('insert or ignore into stars (user_id, repo_id) values (?, ?)').run(me(c).id, repoOf(c).row.id);
});
route('DELETE', '/user/starred/:owner/:repo', (c) => {
	c.db.query('delete from stars where user_id = ? and repo_id = ?').run(me(c).id, repoOf(c).row.id);
});
route('GET', '/repos/:owner/:repo/subscription', (c) =>
	c.db.query('select 1 from watches where user_id = ? and repo_id = ?').get(me(c).id, repoOf(c).row.id) ? { subscribed: true, ignored: false } : error(404, 'Not watching')
);
route('PUT', '/repos/:owner/:repo/subscription', (c) => {
	c.db.query('insert or ignore into watches (user_id, repo_id) values (?, ?)').run(me(c).id, repoOf(c).row.id);
	return { subscribed: true, ignored: false };
});
route('DELETE', '/repos/:owner/:repo/subscription', (c) => {
	c.db.query('delete from watches where user_id = ? and repo_id = ?').run(me(c).id, repoOf(c).row.id);
});

// --- markdown ---

// Context is "<origin>/<owner>/<repo>[/src/branch/<ref>/<dir>]", as Forgejo takes it.
route('POST', '/markdown', async (c) => {
	const b = await c.body<{ Text?: string; Context?: string }>();
	const ctx = (b.Context ?? '').replace(c.origin, '').replace(/^\/+/, '');
	const m = ctx.match(/^([^/]+\/[^/]+)(?:\/src\/branch\/([^/]+)\/?(.*))?$/);
	const html = render(b.Text ?? '', m?.[2] ? { repo: m[1], ref: decodeURIComponent(m[2]), dir: m[3] ?? '' } : m ? { repo: m[1], ref: '', dir: '' } : undefined);
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
});

export { bool, userJson };
