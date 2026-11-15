import { error, redirect } from '@sveltejs/kit';
import { request } from '#lib/server/forgejo.js';

// Star or watch a repo (form posts from the repo header), then back to the page it came from.
export async function POST({ locals, params, request: req, url }) {
	const form = await req.formData();
	const what = form.get('what');
	const repo = `${params.owner}/${params.repo}`;
	const path = what === 'star' ? `/user/starred/${repo}` : what === 'watch' ? `/repos/${repo}/subscription` : error(400, 'Star or watch?');
	await request(locals.token, path, { method: form.get('on') === '1' ? 'PUT' : 'DELETE' });
	const back = req.headers.get('referer');
	redirect(303, back && new URL(back).origin === url.origin ? new URL(back).pathname + new URL(back).search : `/${repo}`);
}
