import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, request, type Pull } from '#lib/server/forgejo.js';
import { openPush } from '#lib/server/home.js';

type BranchInfo = {
	name: string;
	protected: boolean;
	user_can_push: boolean;
	commit: { id: string; message: string; timestamp: string; author: { name: string; username: string } };
};

// Each count is a full compare (commits and files), so only the most recent branches get one.
const COMPARED = 20;

export async function load({ locals, parent }) {
	const { repo } = await parent();
	const base = `/repos/${repo.full_name}`;
	const def = repo.default_branch;
	const [all, pulls] = await Promise.all([api<BranchInfo[]>(locals.token, `${base}/branches?limit=100`), api<Pull[]>(locals.token, `${base}/pulls?state=open&limit=50`)]);
	const branches = all.sort((a, b) => +(b.name === def) - +(a.name === def) || Date.parse(b.commit.timestamp) - Date.parse(a.commit.timestamp));
	const count = (from: string, to: string) =>
		api<{ total_commits: number }>(locals.token, `${base}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`).then((c) => c.total_commits, () => null);
	const counts = await Promise.all(branches.slice(1, COMPARED + 1).map((b) => Promise.all([count(def, b.name), count(b.name, def)])));
	return {
		branches: branches.map((b, i) => {
			const pr = pulls.find((p) => p.head.ref === b.name);
			const [ahead, behind] = counts[i - 1] ?? [null, null];
			return {
				name: b.name,
				sha: b.commit.id,
				message: b.commit.message,
				date: b.commit.timestamp,
				author: b.commit.author.username || b.commit.author.name,
				pr: pr && { number: pr.number, title: pr.title },
				ahead,
				behind,
				deletable: !!repo.permissions?.push && b.user_can_push && !b.protected && b.name !== def
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
		const base = `/repos/${params.owner}/${params.repo}`;
		const name = await branch(req);
		try {
			const [repo, b] = await Promise.all([api<{ default_branch: string }>(locals.token, base), api<BranchInfo>(locals.token, `${base}/branches/${encodeURIComponent(name)}`)]);
			if (name === repo.default_branch || b.protected) return fail(403, { error: `${name} is ${b.protected ? 'protected' : 'the default branch'}, so it can't be deleted` });
			await request(locals.token, `${base}/branches/${encodeURIComponent(name)}`, { method: 'DELETE' });
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
		return { deleted: name };
	}
};
