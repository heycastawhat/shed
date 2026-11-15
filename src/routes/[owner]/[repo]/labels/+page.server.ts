import { fail } from '@sveltejs/kit';
import { apiPage, type Label } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';
import { db } from '#lib/server/shed.js';
import { getRepo } from '#lib/server/repos.js';

export async function load({ locals, params }) {
	const { items } = await apiPage<Label>(locals.token, `/repos/${params.owner}/${params.repo}/labels?limit=100`);
	const row = getRepo(db, params.owner, params.repo)!;
	const counts = new Map(
		db
			.query<{ id: number; n: number }, [number]>(
				"select il.label_id as id, count(*) as n from issue_labels il join issues i on i.id = il.issue_id where i.repo_id = ? and i.state = 'open' group by il.label_id"
			)
			.all(row.id)
			.map((r) => [r.id, r.n])
	);
	return { labels: items.map((l) => ({ ...l, open: counts.get(l.id) ?? 0 })) };
}

const base = (p: { owner: string; repo: string }) => `/repos/${p.owner}/${p.repo}/labels`;

export const actions = {
	save: async ({ locals, params, request }) => {
		const f = await request.formData();
		const id = Number(f.get('id')) || 0;
		const body = { name: String(f.get('name') ?? '').trim(), color: String(f.get('color') ?? ''), description: String(f.get('description') ?? '').trim() };
		if (!body.name) return fail(422, { action: 'save', id, error: 'Give the label a name' });
		const failed = id ? await send('save', locals.token, `${base(params)}/${id}`, 'PATCH', body) : await send('save', locals.token, base(params), 'POST', body);
		if (failed) return fail(failed.status, { ...failed.data, id });
		return { action: 'save', id, saved: true };
	},
	delete: async ({ locals, params, request }) => send('delete', locals.token, `${base(params)}/${Number((await request.formData()).get('id'))}`, 'DELETE')
};
