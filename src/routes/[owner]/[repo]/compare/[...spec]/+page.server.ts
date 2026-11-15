import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { draft } from '#lib/server/home.js';
import { loadDiff } from '#lib/server/diff.js';
import { triageOptions } from '#lib/server/issue.js';
import { api, request, type Commit, type Pull, type User } from '#lib/server/forgejo.js';

type Compare = { total_commits: number; commits: Commit[]; files: unknown[]; mergeable: boolean };

// `base...head`; head may be `owner:branch` for a branch in a fork. No spec at all just shows the branch pickers.
function parseSpec(spec: string, fallback: string) {
	const [base, head] = spec.includes('...') ? spec.split('...') : [fallback, spec];
	return { base: base || fallback, head: head ?? '' };
}
const enc = (ref: string) => ref.split(':').map(encodeURIComponent).join(':');

// Branches of the forks you can see, as `owner:branch` heads. Forks of forks aren't listed; their PRs go to their own parent.
async function forkHeads(token: string | undefined, full: string) {
	const forks = (await api<{ full_name: string; owner: { login: string } }[]>(token, `/repos/${full}/forks`).catch(() => [])).slice(0, 20);
	return Promise.all(
		forks.map(async (f) => ({
			repo: f.full_name,
			branches: (await api<{ name: string }[]>(token, `/repos/${f.full_name}/branches?limit=100`).catch(() => [])).map((b) => `${f.owner.login}:${b.name}`)
		}))
	).then((l) => l.filter((f) => f.branches.length));
}

export async function load({ locals, params, parent }) {
	const { repo } = await parent();
	const { base, head } = parseSpec(params.spec, repo.default_branch);
	const forks = await forkHeads(locals.token, repo.full_name);
	if (!head) return { base, head, forks, compare: null };
	const path = `/repos/${repo.full_name}/compare/${enc(base)}...${enc(head)}`;
	try {
		const [compare, files, open, options] = await Promise.all([
			api<Compare>(locals.token, path),
			loadDiff(locals.token, `${path}.diff`),
			api<Pull[]>(locals.token, `/repos/${repo.full_name}/pulls?state=open&limit=100`),
			locals.user ? Promise.all([triageOptions(locals.token, repo.full_name), api<User[]>(locals.token, `/repos/${repo.full_name}/reviewers`)]).then(([o, reviewers]) => ({ ...o, reviewers })) : null
		]);
		const existing = open.find((p) => p.base.ref === base && p.head.label === head);
		return { base, head, forks, compare: { ...compare, files }, existing: existing && { number: existing.number, title: existing.title }, options, draft: compare.total_commits ? draft(compare, head.split(':').at(-1)!) : null };
	} catch (e) {
		if (isHttpError(e) && e.status === 404) return { base, head, forks, compare: null, missing: true };
		throw e;
	}
}

export const actions = {
	open: async ({ locals, params, request: req }) => {
		const repo = `${params.owner}/${params.repo}`;
		const form = await req.formData();
		const { base, head } = parseSpec(params.spec, String(form.get('base')));
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { action: 'open', error: 'Give it a title' });
		let number: number;
		try {
			const res = await request(locals.token, `/repos/${repo}/pulls`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					base,
					head,
					title,
					body: String(form.get('body') ?? ''),
					draft: form.has('draft'),
					labels: form.getAll('labels').map(Number),
					reviewers: form.getAll('reviewers').map(String)
				})
			});
			number = ((await res.json()) as Pull).number;
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { action: 'open', error: e.body.message });
			throw e;
		}
		redirect(303, `/${repo}/pulls/${number}`);
	}
};
