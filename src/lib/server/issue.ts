import { fail, isHttpError } from '@sveltejs/kit';
import { unsign } from '#lib/sign.js';
import { api, request, type Issue } from './forgejo.js';

type Event = { locals: { token?: string }; params: { owner: string; repo: string; index: string }; request: Request };

export async function send(action: string, token: string | undefined, path: string, method: string, body?: unknown) {
	try {
		await request(token, path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { action, error: e.body.message });
		throw e;
	}
}

// PRs share issue numbers, so the issue endpoints serve both the issue and the PR page.
export const issueActions = {
	label: async ({ locals, params, request: req }: Event) => {
		const form = await req.formData();
		const path = `/repos/${params.owner}/${params.repo}/issues/${params.index}/labels`;
		const id = Number(form.get('id'));
		return form.has('remove') ? send('label', locals.token, `${path}/${id}`, 'DELETE') : send('label', locals.token, path, 'POST', { labels: [id] });
	},
	edit: async ({ locals, params, request: req }: Event) => {
		const form = await req.formData();
		const path = `/repos/${params.owner}/${params.repo}/issues/${params.index}`;
		if (form.has('title')) {
			const title = String(form.get('title')).trim();
			return title ? send('title', locals.token, path, 'PATCH', { title }) : fail(400, { action: 'title', error: 'Title is empty' });
		}
		// The editor shows the body without forge's agent signature; put the original one back so the attribution survives the edit.
		const { body: old } = await api<Issue>(locals.token, path);
		const footer = old.slice(unsign(old).body.length);
		return send('body', locals.token, path, 'PATCH', { body: String(form.get('body') ?? '').trimEnd() + footer });
	}
};
