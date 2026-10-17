import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { request, type Issue } from '#lib/server/forgejo.js';

export const actions = {
	default: async ({ locals, params, request: req }) => {
		const form = await req.formData();
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '');
		if (!title) return fail(400, { title, body, error: 'Give it a title' });
		let issue: Issue;
		try {
			const res = await request(locals.token, `/repos/${params.owner}/${params.repo}/issues`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title, body })
			});
			issue = await res.json();
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { title, body, error: e.body.message });
			throw e;
		}
		redirect(303, `/${params.owner}/${params.repo}/issues/${issue.number}`);
	}
};
