import { fail } from '@sveltejs/kit';
import { apiPage, type Milestone } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';

export async function load({ locals, params, url }) {
	const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
	const base = `/repos/${params.owner}/${params.repo}/milestones`;
	const [list, open, closed] = await Promise.all([
		apiPage<Milestone & { closed_at: string | null }>(locals.token, `${base}?state=${state}&limit=100`),
		apiPage<Milestone>(locals.token, `${base}?state=open&limit=1`),
		apiPage<Milestone>(locals.token, `${base}?state=closed&limit=1`)
	]);
	return { state, milestones: list.items, counts: { open: open.total, closed: closed.total } };
}

const base = (p: { owner: string; repo: string }) => `/repos/${p.owner}/${p.repo}/milestones`;

export const actions = {
	save: async ({ locals, params, request }) => {
		const f = await request.formData();
		const id = Number(f.get('id')) || 0;
		const due = String(f.get('due') ?? '');
		const body = { title: String(f.get('title') ?? '').trim(), description: String(f.get('description') ?? '').trim(), due_on: due ? `${due}T23:59:59Z` : null };
		if (!body.title) return fail(422, { action: 'save', id, error: 'Give the milestone a title' });
		const failed = id ? await send('save', locals.token, `${base(params)}/${id}`, 'PATCH', body) : await send('save', locals.token, base(params), 'POST', body);
		if (failed) return fail(failed.status, { ...failed.data, id });
		return { action: 'save', id, saved: true };
	},
	state: async ({ locals, params, request }) => {
		const f = await request.formData();
		return send('state', locals.token, `${base(params)}/${Number(f.get('id'))}`, 'PATCH', { state: f.get('state') === 'closed' ? 'closed' : 'open' });
	},
	delete: async ({ locals, params, request }) => send('delete', locals.token, `${base(params)}/${Number((await request.formData()).get('id'))}`, 'DELETE')
};
