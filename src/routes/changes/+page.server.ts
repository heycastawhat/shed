import { redirect } from '@sveltejs/kit';
import { search } from '#lib/server/changes.js';

export async function load({ locals }) {
	if (!locals.token) redirect(303, '/login');
	const [review, mine] = await Promise.all([search(locals.token, 'review_requested'), search(locals.token, 'created')]);
	return { review, mine };
}
