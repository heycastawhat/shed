import { fail, isHttpError } from '@sveltejs/kit';
import { parseDiff } from '#lib/diff.js';
import { unsign } from '#lib/sign.js';
import { fixWithAgent } from '#lib/server/fix.js';
import { mention } from '#lib/server/mention.js';
import { issueActions, triageOptions } from '#lib/server/issue.js';
import { api, renderMarkdown, request, setResolved, type CombinedStatus, type Comment, type MergeStyle, type Repo, type Review, type ReviewComment } from '#lib/server/forgejo.js';

export async function load({ locals, params, parent, url }) {
	const repo = `${params.owner}/${params.repo}`;
	const [{ pull, repo: r, user }, comments, reviews] = await Promise.all([
		parent(),
		api<Comment[]>(locals.token, `/repos/${repo}/issues/${params.index}/comments`),
		api<Review[]>(locals.token, `/repos/${repo}/pulls/${params.index}/reviews`)
	]);
	const [status, diff, events, options] = await Promise.all([
		api<CombinedStatus>(locals.token, `/repos/${repo}/commits/${pull.head.sha}/status`),
		request(locals.token, `/repos/${repo}/pulls/${params.index}.diff`).then((res) => res.text()),
		api<{ type: string; user: { login: string } }[]>(locals.token, `/repos/${repo}/issues/${params.index}/timeline`),
		triageOptions(locals.token, repo)
	]);
	// The API has no auto-merge field; the latest schedule/cancel event in the timeline is the only record of it.
	const schedule = events.findLast((e) => e.type === 'pull_scheduled_merge' || e.type === 'pull_cancel_scheduled_merge');
	// Forgejo doesn't flag outdated comments in the API, so a comment counts as current only if its line is still in the diff with the same text.
	const current = new Map<string, string>();
	for (const f of parseDiff(diff))
		for (const h of f.hunks)
			for (const l of h.lines) {
				if (l.new) current.set(`${f.to}\0new:${l.new}`, l.text);
				if (l.old) current.set(`${f.to}\0old:${l.old}`, l.text);
			}
	// Agents sign their text; show that as a label instead of inside the rendered markdown.
	const md = async (text: string) => {
		const { body, agent } = unsign(text);
		return { html: body.trim() ? await renderMarkdown(locals.token, body, repo) : '', agent };
	};
	const timeline = await Promise.all([
		...comments.map(async (c) => ({ id: `c${c.id}`, user: c.user, date: c.created_at, ...(await md(c.body)), state: null, inline: [] })),
		...reviews.map(async (r) => ({
			id: `r${r.id}`,
			user: r.user,
			date: r.submitted_at,
			...(await md(r.body)),
			state: r.state,
			inline: await Promise.all(
				(await api<ReviewComment[]>(locals.token, `/repos/${repo}/pulls/${params.index}/reviews/${r.id}/comments`)).map(async (c) => {
					const line = c.position ? `new:${c.position}` : `old:${c.original_position}`;
					const outdated = current.get(`${c.path}\0${line}`) !== c.diff_hunk.split('\n').at(-1)?.slice(1);
					return {
						id: c.id,
						review: r.id,
						thread: `${c.path}\0${line}`,
						closed: !!c.resolver || outdated,
						root: false,
						resolved: !!c.resolver,
						path: c.path,
						line: c.position || c.original_position,
						outdated,
						// The last few lines of the hunk are the code the comment points at.
						context: c.diff_hunk.split('\n').slice(1).slice(-3),
						...(await md(c.body))
					};
				})
			)
		}))
	]);
	timeline.sort((a, b) => a.date.localeCompare(b.date));

	// A thread is its comments on one line; its first comment carries the resolve reaction.
	const threads = new Map<string, { root: number; closed: boolean; resolved: boolean }>();
	for (const c of timeline.flatMap((t) => t.inline)) {
		const t = threads.get(c.thread);
		threads.set(c.thread, { root: Math.min(t?.root ?? c.id, c.id), closed: !!t?.closed || c.closed, resolved: !!t?.resolved || c.resolved });
	}
	for (const c of timeline.flatMap((t) => t.inline)) {
		const t = threads.get(c.thread)!;
		c.root = t.root === c.id;
		c.resolved = t.resolved;
	}
	const description = await md(pull.body);
	const mine = reviews.findLast((v) => v.user.id === user?.id && !v.dismissed && (v.state === 'APPROVED' || v.state === 'REQUEST_CHANGES'));
	return {
		body: description.html,
		options,
		timeline,
		mergeStyles: mergeStyles(r),
		checks: {
			state: status.state,
			list: (status.statuses ?? []).map((s) => ({
				// Actions names jobs "<workflow> / <job> (<event>)", and an unnamed workflow leaves a bare "/ ".
				name: s.context.replace(/^\/ /, ''),
				state: s.status,
				description: s.description,
				url: s.target_url && new URL(s.target_url, url.origin).href,
				run: s.target_url?.match(/\/actions\/runs\/(\d+)\//)?.[1]
			})).sort((a, b) => a.name.localeCompare(b.name))
		},
		openThreads: [...threads.values()].filter((t) => !t.closed && !t.resolved).length,
		autoMerge: schedule?.type === 'pull_scheduled_merge' ? schedule.user.login : null,
		approved: mine?.state === 'APPROVED' && !mine.stale
	};
}

const STYLES: [MergeStyle, keyof Repo, string][] = [
	['merge', 'allow_merge_commits', 'Merge'],
	['squash', 'allow_squash_merge', 'Squash & merge'],
	['rebase', 'allow_rebase', 'Rebase & merge'],
	['rebase-merge', 'allow_rebase_explicit', 'Rebase & merge commit'],
	['fast-forward-only', 'allow_fast_forward_only_merge', 'Fast-forward']
];

function mergeStyles(repo: Repo) {
	return STYLES.filter(([, flag]) => repo[flag]).map(([value, , label]) => ({ value, label }));
}

async function post(action: string, token: string | undefined, path: string, body?: unknown, method = 'POST') {
	try {
		await request(token, path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { action, error: e.body.message });
		throw e;
	}
}

export const actions = {
	comment: async ({ locals, params, request: req, url }) => {
		const body = String((await req.formData()).get('body') ?? '').trim();
		if (!body) return fail(400, { action: 'comment', error: 'Comment is empty' });
		return (await post('comment', locals.token, `/repos/${params.owner}/${params.repo}/issues/${params.index}/comments`, { body })) ?? mention(locals.token, url.origin, params, body);
	},
	approve: async ({ locals, params }) =>
		post('approve', locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}/reviews`, { event: 'APPROVED', body: '' }),
	agent: async ({ locals, params, request: req }) => fixWithAgent(locals.token, params.owner, params.repo, params.index, await req.formData()),
	resolve: async ({ locals, params, request: req }) => setResolved(locals.token, `${params.owner}/${params.repo}`, await req.formData()),
	merge: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		return post('merge', locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}/merge`, {
			Do: form.get('style'),
			delete_branch_after_merge: form.has('delete_branch'),
			merge_when_checks_succeed: form.has('when_checks_pass')
		});
	},
	// Status links carry the run's number in the repo; re-run just the failed jobs of each.
	rerun: async ({ locals, params, request: req }) => {
		const runs = new Set((await req.formData()).getAll('run').map(String));
		try {
			for (const n of runs) await request(locals.token, `/repos/${params.owner}/${params.repo}/actions/runs/${n}/rerun?failed=true`, { method: 'POST' });
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { action: 'rerun', error: e.body.message });
			throw e;
		}
	},
	cancelAutoMerge: async ({ locals, params }) =>
		post('merge', locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}/merge`, undefined, 'DELETE'),
	...issueActions
};
