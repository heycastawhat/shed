import { redirect } from '@sveltejs/kit';
import { request } from '#lib/server/forgejo.js';

// "Sync now" on a mirror.
export async function POST({ locals, params }) {
	await request(locals.token, `/repos/${params.owner}/${params.repo}/mirror-sync`, { method: 'POST' });
	redirect(303, `/${params.owner}/${params.repo}`);
}
