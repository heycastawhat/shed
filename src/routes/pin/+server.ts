import { error, redirect } from '@sveltejs/kit';
import { api, type User } from '#lib/server/forgejo.js';
import { update } from '#lib/server/store.js';

// Pin or unpin a repo for the sidebar. A plain form post, so it works with or without JavaScript.
export async function POST({ locals, request }) {
	if (!locals.token) error(401, 'Log in first');
	const form = await request.formData();
	const repo = String(form.get('repo') ?? '');
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) error(400, 'Expected owner/name');
	const me = await api<User>(locals.token, '/user');
	const pin = form.get('pin') === '1';
	// Only pinning checks the repo, so a pin for a repo that has since been deleted can still be removed.
	if (pin) await api(locals.token, `/repos/${repo}`);
	await update((d) => {
		const rest = (d.pins[me.id] ?? []).filter((r) => r !== repo);
		d.pins[me.id] = pin ? [...rest, repo] : rest;
	});
	const back = request.headers.get('referer');
	redirect(303, back && new URL(back).origin === new URL(request.url).origin ? back : '/repos');
}
