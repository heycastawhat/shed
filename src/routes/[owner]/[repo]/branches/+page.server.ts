import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { aheadBehind, branches } from '#lib/server/browse.js';
import { api, type Pull } from '#lib/server/forgejo.js';
import { git, gitTry } from '#lib/server/git.js';
import { afterPush, refSnapshot } from '#lib/server/push.js';
import { db, root } from '#lib/server/shed.js';
import { repoFor, toCommits } from '#lib/server/shedrepo.js';
import { openPush } from '#lib/server/home.js';

// Ahead/behind is cheap with git, but still one call per branch, so cap it for repos with hundreds of branches.
const COMPARED = 50;

export async function load({ locals, params, parent }) {
	const { repo } = await parent();
	const { dir } = repoFor(locals, params.owner, params.repo);
	const def = repo.default_branch;
	const [all, pulls] = await Promise.all([
		branches(dir),
		// Bridge: PRs still live in Forgejo.
		locals.token ? api<Pull[]>(locals.token, `/repos/${repo.full_name}/pulls?state=open&limit=50`).catch(() => []) : []
	]);
	const list = all.sort((a, b) => +(b.name === def) - +(a.name === def) || Date.parse(b.date) - Date.parse(a.date));
	const defSha = list.find((b) => b.name === def)?.sha;
	const counts = await Promise.all(list.slice(1, COMPARED + 1).map((b) => (defSha ? aheadBehind(dir, defSha, b.sha) : null)));
	const users = toCommits(db, list.map((b) => ({ sha: b.sha, parents: [], author: b.author, email: b.email, date: b.date, committer: '', committerEmail: '', committed: '', message: b.subject })));
	return {
		branches: list.map((b, i) => {
			const pr = pulls.find((p) => p.head.ref === b.name);
			const c = counts[i - 1];
			return {
				name: b.name,
				sha: b.sha,
				message: b.subject,
				date: b.date,
				author: users[i].author?.login ?? b.author,
				pr: pr && { number: pr.number, title: pr.title },
				ahead: c?.ahead ?? null,
				behind: c?.behind ?? null,
				deletable: !!repo.permissions?.push && b.name !== def
			};
		})
	};
}

const branch = async (req: Request) => String((await req.formData()).get('branch') ?? '');

export const actions = {
	openPr: async ({ locals, params, request: req }) => {
		let number: number;
		try {
			number = await openPush(locals.token!, `${params.owner}/${params.repo}`, await branch(req));
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
		redirect(303, `/${params.owner}/${params.repo}/pulls/${number}`);
	},
	delete: async ({ locals, params, request: req }) => {
		const { row, dir } = repoFor(locals, params.owner, params.repo, 'write');
		const name = await branch(req);
		if (name === row.default_branch) return fail(403, { error: `${name} is the default branch, so it can't be deleted` });
		const sha = await gitTry(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]);
		if (!sha) return fail(404, { error: `There's no branch called ${name}` });
		// Compare-and-swap: if someone pushed to it since, the delete fails rather than losing their commit.
		const before = await refSnapshot(dir);
		await git(dir, ['update-ref', '-d', `refs/heads/${name}`, sha.trim()]);
		await afterPush(db, root, row, locals.user!.id, before);
		return { deleted: name };
	}
};
