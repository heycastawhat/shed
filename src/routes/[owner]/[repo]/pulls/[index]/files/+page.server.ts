import { fail, isHttpError } from '@sveltejs/kit';
import type { Draft } from '#lib/diff.js';
import { loadDiff } from '#lib/server/diff.js';
import { fixWithAgent } from '#lib/server/fix.js';
import { mention } from '#lib/server/mention.js';
import { unsign } from '#lib/sign.js';
import { api, isResolved, renderMarkdown, request, setResolved, type Review, type ReviewComment } from '#lib/server/forgejo.js';

export type LineComment = { id: number; review: number; user: { login: string; avatar_url: string }; date: string; html: string; agent?: string };

export async function load({ locals, params }) {
	const repo = `${params.owner}/${params.repo}`;
	const pr = `/repos/${repo}/pulls/${params.index}`;
	const [files, reviews] = await Promise.all([loadDiff(locals.token, `${pr}.diff`), api<Review[]>(locals.token, `${pr}/reviews`)]);
	const all = (await Promise.all(reviews.map((r) => api<ReviewComment[]>(locals.token, `${pr}/reviews/${r.id}/comments`)))).flat();

	// Keyed "path\0old:N" or "path\0new:N"; Forgejo puts new-side lines in `position`, old-side in `original_position`.
	const comments: Record<string, LineComment[]> = {};
	for (const c of all.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
		const key = `${c.path}\0${c.position ? `new:${c.position}` : `old:${c.original_position}`}`;
		const { body, agent } = unsign(c.body);
		(comments[key] ??= []).push({ id: c.id, review: c.pull_request_review_id, user: c.user, date: c.created_at, html: await renderMarkdown(locals.token, body, repo), agent });
	}
	const resolved = (await Promise.all(Object.values(comments).map(async ([root]) => ((await isResolved(locals.token, repo, root.id)) ? [root.id] : [])))).flat();
	return { files, comments, resolved };
}

// Posting a review is the only way to make a line comment; the line goes in new_position or old_position by side.
async function review(token: string | undefined, pr: string, event: string, body: string, drafts: Draft[], action: string) {
	try {
		await request(token, `${pr}/reviews`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				event,
				body,
				comments: drafts.map((d) => {
					const [side, line] = d.line.split(':');
					return { path: d.path, body: d.body, [side === 'old' ? 'old_position' : 'new_position']: Number(line) };
				})
			})
		});
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { action, error: e.body.message });
		throw e;
	}
}

export const actions = {
	comment: async ({ locals, params, request: req, url }) => {
		const form = await req.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { action: 'comment', error: 'Comment is empty' });
		const draft = { path: String(form.get('path')), line: String(form.get('line')), body };
		return (await review(locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}`, 'COMMENT', '', [draft], 'comment')) ?? mention(locals.token, url.origin, params, body, draft);
	},
	agent: async ({ locals, params, request: req }) => fixWithAgent(locals.token, params.owner, params.repo, params.index, await req.formData()),
	resolve: async ({ locals, params, request: req }) => setResolved(locals.token, `${params.owner}/${params.repo}`, await req.formData()),
	review: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		const drafts: Draft[] = JSON.parse(String(form.get('comments') ?? '[]'));
		const body = String(form.get('body') ?? '').trim();
		return review(locals.token, `/repos/${params.owner}/${params.repo}/pulls/${params.index}`, String(form.get('event')), body, drafts, 'review');
	}
};
