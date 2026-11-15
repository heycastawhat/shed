import { fail, redirect } from '@sveltejs/kit';
import { issueActions, send, triageOptions } from '#lib/server/issue.js';
import { mention } from '#lib/server/mention.js';
import { loadThread, threadActions } from '#lib/server/thread.js';
import { unsign } from '#lib/sign.js';
import { api, renderMarkdown, type Issue } from '#lib/server/forgejo.js';

export async function load({ locals, params }) {
	const repo = `${params.owner}/${params.repo}`;
	const [issue, thread, options] = await Promise.all([
		api<Issue>(locals.token, `/repos/${repo}/issues/${params.index}`),
		loadThread(locals.token, repo, params.index, locals.user?.login),
		triageOptions(locals.token, repo)
	]);
	// Pull requests are issues too in Forgejo's numbering, so /issues/N can be a PR.
	if (issue.pull_request) redirect(303, `/${repo}/pulls/${params.index}`);
	const { body, agent } = unsign(issue.body);
	return { issue, options, thread, description: { html: body.trim() ? await renderMarkdown(locals.token, body, repo) : '', agent } };
}

export const actions = {
	comment: async ({ locals, params, request: req, url }) => {
		const body = String((await req.formData()).get('body') ?? '').trim();
		if (!body) return fail(400, { action: 'comment', error: 'Comment is empty' });
		return (await send('comment', locals.token, `/repos/${params.owner}/${params.repo}/issues/${params.index}/comments`, 'POST', { body })) ?? mention(locals.token, url.origin, params, body);
	},
	...threadActions,
	...issueActions
};
