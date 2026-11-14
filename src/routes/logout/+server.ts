import { redirect } from '@sveltejs/kit';
import { clearSession } from '#lib/server/auth.js';

export async function POST({ cookies, url }) {
	await clearSession(cookies, url);
	redirect(303, '/');
}
