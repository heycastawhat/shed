import { fail, redirect } from '@sveltejs/kit';
import { issueActions, send } from '#lib/server/issue.js';
import { unsign } from '#lib/sign.js';
import { api, renderMarkdown, type Issue, type Label, type User } from '#lib/server/forgejo.js';

type Event = { id: number; type: string; user: User; body: string; created_at: string; label?: Label; old_title?: string; new_title?: string };
const SHOWN = ['comment', 'close', 'reopen', 'label', 'change_title'];

export async function load({ locals, params }) {
	const repo = `${params.owner}/${params.repo}`;
	const path = `/repos/${repo}/issues/${params.index}`;
	const [issue, events, labels] = await Promise.all([
		api<Issue>(locals.token, path),
		api<Event[] | null>(locals.token, `${path}/timeline?limit=100`),
		api<Label[]>(locals.token, `/repos/${repo}/labels?limit=100`)
	]);
	// Pull requests are issues too in Forgejo's numbering, so /issues/N can be a PR.
	if (issue.pull_request) redirect(303, `/${repo}/pulls/${params.index}`);
	const md = async (text: string) => {
		const { body, agent } = unsign(text);
		return { html: body.trim() ? await renderMarkdown(locals.token, body, repo) : '', agent };
	};
	return {
		issue,
		labels,
		description: await md(issue.body),
		timeline: await Promise.all(
			// An issue with no activity gets `null` rather than an empty list.
			(events ?? [])
				.filter((e) => SHOWN.includes(e.type) && (e.type !== 'label' || e.label))
				.map(async (e) => ({
					id: e.id,
					type: e.type,
					user: e.user,
					date: e.created_at,
					label: e.label,
					added: e.body === '1',
					title: e.type === 'change_title' ? { from: e.old_title, to: e.new_title } : undefined,
					...(e.type === 'comment' ? await md(e.body) : { html: '', agent: undefined })
				}))
		)
	};
}

export const actions = {
	comment: async ({ locals, params, request: req }) => {
		const body = String((await req.formData()).get('body') ?? '').trim();
		if (!body) return fail(400, { action: 'comment', error: 'Comment is empty' });
		return send('comment', locals.token, `/repos/${params.owner}/${params.repo}/issues/${params.index}/comments`, 'POST', { body });
	},
	// Close or reopen, posting the composer's text first if there is any.
	state: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		const path = `/repos/${params.owner}/${params.repo}/issues/${params.index}`;
		const body = String(form.get('body') ?? '').trim();
		return (body && (await send('comment', locals.token, `${path}/comments`, 'POST', { body }))) || send('comment', locals.token, path, 'PATCH', { state: form.get('to') });
	},
	...issueActions
};
