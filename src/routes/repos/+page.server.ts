import { redirect } from '@sveltejs/kit';
import { api, type Repo } from '#lib/server/forgejo.js';

export async function load({ locals }) {
	if (!locals.token) redirect(303, '/login');
	return { repos: await api<Repo[]>(locals.token, '/user/repos?limit=50') };
}
