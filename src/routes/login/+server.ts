import { redirect } from '@sveltejs/kit';
import { authorizeUrl } from '#lib/server/auth.js';

export function GET({ url, cookies }) {
	const state = crypto.randomUUID();
	cookies.set('oauth_state', state, { path: '/auth/callback', httpOnly: true, sameSite: 'lax', maxAge: 600 });
	const target = authorizeUrl(`${url.origin}/auth/callback`, state);
	redirect(303, target, { external: [target.origin] });
}
