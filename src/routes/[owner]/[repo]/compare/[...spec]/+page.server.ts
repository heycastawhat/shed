import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { FORGEJO_URL } from '$app/env/private';
import { parseDiff } from '#lib/diff.js';
import { highlightDiff } from '#lib/server/highlight.js';
import { draft } from '#lib/server/home.js';
import { triageOptions } from '#lib/server/issue.js';
import { api, request, type Commit, type Pull, type User } from '#lib/server/forgejo.js';

type Compare = { total_commits: number; commits: Commit[]; files: { filename: string; status: string }[] | null };

export async function load({ locals, params, parent }) {
	const { repo, user } = await parent();
	const [a, b] = params.spec.includes('...') ? params.spec.split('...') : [repo.default_branch, params.spec || repo.default_branch];
	const base = a || repo.default_branch;
	const head = b || repo.default_branch;
	const path = `/repos/${repo.full_name}`;
	const cmp = (from: string, to: string) => api<Compare>(locals.token, `${path}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`);
	const same = base === head;
	const [ahead, behind, open, options, reviewers] = await Promise.all([
		same ? null : cmp(base, head).catch(() => null),
		same ? null : cmp(head, base).then((c) => c.total_commits, () => null),
		api<Pull[]>(locals.token, `${path}/pulls?state=open&limit=50`),
		repo.permissions.push ? triageOptions(locals.token, repo.full_name) : null,
		repo.permissions.push ? api<User[]>(locals.token, `${path}/assignees`) : []
	]);
	// The API has no compare diff, so it comes from Forgejo's web route; that only works without a session on public repos, so private ones get the file list only.
	const diff =
		ahead?.total_commits &&
		(await fetch(`${FORGEJO_URL}/${repo.full_name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}.diff`, { headers: { authorization: `Bearer ${locals.token}` } })
			.then(async (r) => (r.ok && r.headers.get('content-type')?.startsWith('text/plain') ? highlightDiff(parseDiff(await r.text())) : null))
			.catch(() => null));
	return {
		base,
		head,
		missing: !same && !ahead,
		commits: [...(ahead?.commits ?? [])].reverse(),
		ahead: ahead?.total_commits ?? 0,
		behind,
		files: diff || null,
		changed: ahead?.files ?? [],
		existing: open.find((p) => p.head.ref === head && p.base.ref === base),
		draft: ahead?.total_commits ? draft(ahead, head) : { title: '', body: '' },
		options,
		reviewers: reviewers.filter((r) => r.id !== user?.id)
	};
}

export const actions = {
	create: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		const repo = `/repos/${params.owner}/${params.repo}`;
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Title is empty' });
		const ids = (k: string) => form.getAll(k).map(Number);
		let number: number;
		try {
			const res = await request(locals.token, `${repo}/pulls`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					base: form.get('base'),
					head: form.get('head'),
					// Forgejo has no draft flag on create; a WIP: prefix is how it marks one.
					title: form.has('draft') && !/^(wip:|\[wip\])/i.test(title) ? `WIP: ${title}` : title,
					body: String(form.get('body') ?? ''),
					labels: ids('label'),
					assignees: form.getAll('assignee').map(String),
					milestone: Number(form.get('milestone')) || undefined
				})
			});
			number = ((await res.json()) as Pull).number;
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
		const reviewers = form.getAll('reviewer').map(String);
		if (reviewers.length)
			await request(locals.token, `${repo}/pulls/${number}/requested_reviewers`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reviewers })
			}).catch(() => {});
		redirect(303, `/${params.owner}/${params.repo}/pulls/${number}`);
	}
};
