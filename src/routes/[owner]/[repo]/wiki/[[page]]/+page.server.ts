import { fail, redirect } from '@sveltejs/kit';
import { repoFor } from '#lib/server/shedrepo.js';
import { saveWikiPage, wikiPage } from '#lib/server/wiki.js';

export async function load({ locals, params, url }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const name = params.page ?? 'Home';
	return { ...(await wikiPage(dir, `${params.owner}/${params.repo}`, name)), name, editing: url.searchParams.has('edit'), creating: url.searchParams.has('new') };
}

export const actions = {
	save: async ({ locals, params, request }) => {
		const { dir } = repoFor(locals, params.owner, params.repo, 'write');
		const form = await request.formData();
		const name = String(form.get('title') ?? '').trim();
		const text = String(form.get('text') ?? '');
		if (!name) return fail(400, { error: 'Give the page a title' });
		const u = locals.user!;
		await saveWikiPage(dir, { name, from: String(form.get('from') ?? '') || undefined, text, message: String(form.get('message') ?? ''), author: { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` } });
		redirect(303, `/${params.owner}/${params.repo}/wiki/${encodeURIComponent(name.replaceAll(' ', '-'))}`);
	},
	delete: async ({ locals, params }) => {
		const { dir } = repoFor(locals, params.owner, params.repo, 'write');
		const u = locals.user!;
		await saveWikiPage(dir, { name: params.page ?? 'Home', text: null, author: { name: u.name || u.login, email: u.email ?? `${u.login}@users.noreply` } });
		redirect(303, `/${params.owner}/${params.repo}/wiki`);
	}
};
