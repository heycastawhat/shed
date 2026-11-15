import { error } from '@sveltejs/kit';
import { APP_REDIRECT, issueCode, validChallenge } from '#lib/server/appauth.js';

// A plain 303 rather than redirect(): the target is the app's custom scheme, not a web origin.
export async function POST({ request, locals }) {
	if (!locals.user) error(401, 'Sign in first');
	const f = await request.formData();
	const challenge = f.get('code_challenge') as string | null;
	const state = f.get('state') as string | null;
	if (!validChallenge(challenge) || !state) error(400, 'This sign-in link is not from the Shed app');
	const code = issueCode(locals.user.id, challenge);
	return new Response(null, { status: 303, headers: { location: `${APP_REDIRECT}?code=${code}&state=${encodeURIComponent(state)}` } });
}
