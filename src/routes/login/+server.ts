import { redirect } from '@sveltejs/kit';
import { authorizeUrl, cookie } from '#lib/server/auth.js';

export function GET({ url, cookies }) {
	const state = crypto.randomUUID();
	cookies.set('oauth_state', state, { ...cookie(url, 600), path: '/auth/callback' });
	const target = authorizeUrl(`${url.origin}/auth/callback`, state);
	redirect(303, target, { external: [target.origin] });
}
