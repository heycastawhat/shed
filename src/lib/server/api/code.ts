import { error } from '@sveltejs/kit';
import { record } from '../activity.js';
import { isEmpty } from '../browse.js';
import { planChanges, type FileOp } from '../files.js';
import { forkParent, forkRepo } from '../fork.js';
import { afterPush, refSnapshot } from '../push.js';
import { checkName, getRepo, type RepoRow } from '../repos.js';
import { commitFiles } from '../write.js';
import { refSha, repoJson, repoOf } from './common.js';
import { checkRefWrite } from './protect.js';
import { me, route } from './router.js';

// Several file changes in one commit (Forgejo's ChangeFiles): uploads, renames, edits. Every operation is checked against the branch
// before anything is written, and the branch only moves if nobody pushed in between.
route('POST', '/repos/:owner/:repo/contents', async (c) => {
	const r = repoOf(c, 'write');
	const b = await c.body<{ files?: FileOp[]; message?: string; branch?: string; new_branch?: string }>();
	const u = me(c);
	const branch = b.branch || r.row.default_branch;
	const parent = await refSha(r.dir, `refs/heads/${branch}`);
	if (!parent && !(await isEmpty(r.dir))) error(404, `There's no branch called ${branch}`);
	if (b.new_branch) {
		if (!/^[A-Za-z0-9._/-]{1,200}$/.test(b.new_branch) || /\.\.|^[-/.]|\/$|\.lock$|\/\/|@\{/.test(b.new_branch)) error(422, `${b.new_branch} isn't a valid branch name`);
		if (await refSha(r.dir, `refs/heads/${b.new_branch}`)) error(409, `${b.new_branch} already exists`);
	}
	checkRefWrite(c.db, r.row, r.level, b.new_branch || branch, 'push');
	const changes = await planChanges(r.dir, parent, b.files ?? []);
	const before = await refSnapshot(r.dir);
	const n = changes.length;
	const sha = await commitFiles(r.dir, {
		branch: b.new_branch || branch,
		parent,
		newBranch: !!b.new_branch,
		changes,
		message: b.message?.trim() || (n === 1 ? `Update ${changes[0].path}` : `Update ${n} files`),
		author: { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` }
	}).catch((e) => error(409, String(e.message ?? e)));
	await afterPush(c.db, c.root, r.row, u.id, before);
	return {
		commit: { sha, html_url: `${c.origin}/${r.full}/commit/${sha}` },
		files: changes.map((x) => (x.content === null ? null : { path: x.path, name: x.path.split('/').pop() }))
	};
});

route('GET', '/repos/:owner/:repo/forks', async (c) => {
	const r = repoOf(c);
	const rows = c.db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.fork_of = ? order by r.created_at desc').all(r.row.id);
	const out = [];
	for (const row of rows) {
		const json = await repoJson(c, row);
		if (json.permissions.pull) out.push(json);
	}
	return out;
});

route('POST', '/repos/:owner/:repo/forks', async (c) => {
	const r = repoOf(c);
	const b = await c.body<{ organization?: string; name?: string }>();
	const u = me(c);
	let ownerId = u.id;
	let owner = u.login;
	if (b.organization) {
		const org = c.db.query<{ id: number; login: string }, [string]>("select id, login from users where login = ? and kind = 'org'").get(b.organization) ?? error(404, 'Organization not found');
		if (!c.db.query('select 1 from org_members where org_id = ? and user_id = ?').get(org.id, u.id)) error(403, `You're not a member of ${org.login}`);
		[ownerId, owner] = [org.id, org.login];
	}
	const name = checkName(b.name || r.row.name, 'Repo name');
	if (getRepo(c.db, owner, name)) error(409, `${owner}/${name} already exists`);
	const row = await forkRepo(c.db, c.root, r.row, ownerId, name);
	record(c.db, { userId: u.id, repoId: row.id, op: 'create_repo' });
	return { ...(await repoJson(c, row)), parent: forkParent(c.db, row.id) };
});
