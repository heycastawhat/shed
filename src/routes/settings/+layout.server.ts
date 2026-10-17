import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
	if (!locals.token) redirect(303, '/login');
}
