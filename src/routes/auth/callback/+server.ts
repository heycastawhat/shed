import { error, redirect } from '@sveltejs/kit';
import { cookie, grant, startSession } from '#lib/server/auth.js';

export async function GET({ url, cookies, request }) {
	const state = cookies.get('oauth_state');
	cookies.delete('oauth_state', { ...cookie(url), path: '/auth/callback' });
	const code = url.searchParams.get('code');
	if (!code || !state || url.searchParams.get('state') !== state) error(400, 'Invalid OAuth callback');
	await startSession(cookies, url, await grant({ grant_type: 'authorization_code', code, redirect_uri: `${url.origin}/auth/callback` }), request.headers.get('user-agent'));
	redirect(303, '/');
}
