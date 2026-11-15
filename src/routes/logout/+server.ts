import { redirect } from '@sveltejs/kit';
import { endSession } from '#lib/server/accounts.js';
import { cookie } from '#lib/server/auth.js';
import { db } from '#lib/server/shed.js';

export function POST({ cookies, url }) {
	const id = cookies.get('shed_session');
	if (id) endSession(db, id);
	cookies.delete('shed_session', cookie(url));
	redirect(303, '/');
}
