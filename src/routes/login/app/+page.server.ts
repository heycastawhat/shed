import { error, redirect } from '@sveltejs/kit';
import { APP_REDIRECT, validChallenge } from '#lib/server/appauth.js';

export function load({ url, locals }) {
	const q = url.searchParams;
	if (q.get('redirect_uri') !== APP_REDIRECT || q.get('code_challenge_method') !== 'S256' || !validChallenge(q.get('code_challenge')) || !q.get('state'))
		error(400, 'This sign-in link is not from the Shed app');
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return { login: locals.user.login, challenge: q.get('code_challenge')!, state: q.get('state')!, cancel: `${APP_REDIRECT}?error=access_denied&state=${encodeURIComponent(q.get('state')!)}` };
}
