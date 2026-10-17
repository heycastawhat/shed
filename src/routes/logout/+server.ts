import { redirect } from '@sveltejs/kit';
import { clearSession } from '#lib/server/auth.js';

export async function POST({ cookies }) {
	await clearSession(cookies);
	redirect(303, '/');
}
