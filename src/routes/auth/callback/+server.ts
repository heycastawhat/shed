import { error, redirect } from '@sveltejs/kit';
import { isAllowed, signIn, startSession } from '#lib/server/accounts.js';
import { cookie, describeUa } from '#lib/server/auth.js';
import { exchange, safeNext, type Pending } from '#lib/server/oidc.js';
import { allowlist, db, provider } from '#lib/server/shed.js';

export async function GET({ url, cookies, request }) {
	const raw = cookies.get('shed_oidc');
	cookies.delete('shed_oidc', { ...cookie(url), path: '/auth/callback' });
	const pending: Pending | null = raw ? JSON.parse(raw) : null;
	const code = url.searchParams.get('code');
	if (url.searchParams.get('error')) error(400, `Sign-in was cancelled or refused: ${url.searchParams.get('error_description') ?? url.searchParams.get('error')}`);
	if (!code || !pending || url.searchParams.get('state') !== pending.state) error(400, 'This sign-in link expired or was already used; start again');
	const claims = await exchange(provider, `${url.origin}/auth/callback`, code, pending);
	if (!isAllowed(allowlist, claims)) error(403, `${claims.preferred_username ?? claims.email ?? 'This account'} isn't allowed to sign in to this Shed`);
	const id = startSession(db, signIn(db, claims), describeUa(request.headers.get('user-agent')));
	cookies.set('shed_session', id, cookie(url, 30 * 24 * 60 * 60));
	redirect(303, safeNext(pending.next) ?? '/');
}
