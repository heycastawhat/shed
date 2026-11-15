import { redirect } from '@sveltejs/kit';
import { endSessions, listSessions } from '#lib/server/accounts.js';
import { db, provider } from '#lib/server/shed.js';

export function load({ locals, cookies }) {
	if (!locals.user) redirect(303, '/login');
	return { me: locals.user, provider: provider.issuer, sessions: listSessions(db, locals.user.id, cookies.get('shed_session')) };
}

export const actions = {
	end: async ({ locals, cookies, request }) => {
		if (!locals.user) redirect(303, '/login');
		endSessions(db, locals.user.id, cookies.get('shed_session'), String((await request.formData()).get('id')));
	},
	endOthers: ({ locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');
		endSessions(db, locals.user.id, cookies.get('shed_session'));
	}
};
