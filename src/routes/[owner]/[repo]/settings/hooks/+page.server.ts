import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';
import { EVENTS } from '#lib/server/api/hooks.js';

type Hook = { id: number; config: { url: string }; events: string[]; active: boolean; created_at: string };
type Delivery = { id: number; event: string; status: number | null; response: string; created_at: string };

export async function load({ locals, params }) {
	const base = `/repos/${params.owner}/${params.repo}/hooks`;
	const hooks = await api<Hook[]>(locals.token, base);
	const deliveries = await Promise.all(hooks.map((h) => api<Delivery[]>(locals.token, `${base}/${h.id}/deliveries`)));
	return { events: [...EVENTS], hooks: hooks.map((h, i) => ({ id: h.id, url: h.config.url, events: h.events, active: h.active, deliveries: deliveries[i].slice(0, 10) })) };
}

const base = (p: { owner: string; repo: string }) => `/repos/${p.owner}/${p.repo}/hooks`;

export const actions = {
	save: async ({ locals, params, request }) => {
		const f = await request.formData();
		const id = Number(f.get('id')) || 0;
		const events = f.getAll('event').map(String);
		if (!events.length) return fail(422, { action: 'save', id, error: 'Pick at least one event' });
		const secret = String(f.get('secret') ?? '');
		const config = { url: String(f.get('url') ?? '').trim(), content_type: 'json', ...((secret || !id) && { secret }) };
		const body = { type: 'forgejo', config, events, active: f.has('active') };
		const failed = id ? await send('save', locals.token, `${base(params)}/${id}`, 'PATCH', body) : await send('save', locals.token, base(params), 'POST', body);
		if (failed) return fail(failed.status, { ...failed.data, id });
		return { action: 'save', id, saved: true };
	},
	delete: async ({ locals, params, request }) => send('delete', locals.token, `${base(params)}/${Number((await request.formData()).get('id'))}`, 'DELETE'),
	test: async ({ locals, params, request }) => {
		const id = Number((await request.formData()).get('id'));
		return (await send('test', locals.token, `${base(params)}/${id}/tests`, 'POST')) ?? { action: 'test', id, tested: true };
	}
};
