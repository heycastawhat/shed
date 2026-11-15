import { error } from '@sveltejs/kit';
import { FORGEJO_URL, FORGEJO_CLIENT_ID, FORGEJO_CLIENT_SECRET } from '$app/env/private';
import { decrypt, encrypt, read, update } from './store.js';

type Grant = { access_token: string; refresh_token: string; expires_in: number };

// Secure follows the request so plain-http dev and LAN setups still get cookies; behind the TLS proxy url.protocol is https.
export const cookie = (url: URL, maxAge?: number) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:', maxAge });

export async function grant(params: Record<string, string>): Promise<Grant> {
	const res = await fetch(new URL('/login/oauth/access_token', FORGEJO_URL), {
		method: 'POST',
		headers: { accept: 'application/json' },
		body: new URLSearchParams({ client_id: FORGEJO_CLIENT_ID, client_secret: FORGEJO_CLIENT_SECRET, ...params })
	});
	if (!res.ok) error(502, `Forgejo token exchange failed: ${await res.text()}`);
	return res.json();
}

// Forgejo refresh tokens are single-use and shared by every login of a user, so forge keeps the one live token server-side
// (encrypted) and hands out access tokens from it. Browser sessions and agent keys both go through userToken.
const access = new Map<number, { token: string; expires: number }>();
const refreshing = new Map<number, Promise<string>>();

async function remember(userId: number, login: string, g: Grant) {
	access.set(userId, { token: g.access_token, expires: Date.now() + g.expires_in * 1000 });
	const refresh = await encrypt(g.refresh_token);
	await update((d) => (d.grants[userId] = { login, refresh }));
}

// Forgejo access tokens last an hour, so refresh transparently instead of bouncing to login.
// Concurrent callers share one refresh, since a second use of the same refresh token would fail.
export async function userToken(userId: number) {
	const a = access.get(userId);
	if (a && Date.now() < a.expires - 60_000) return a.token;
	let p = refreshing.get(userId);
	if (!p) {
		p = (async () => {
			const stored = (await read()).grants[userId];
			if (!stored) error(401, 'Log in to forge again');
			const g = await grant({ grant_type: 'refresh_token', refresh_token: await decrypt(stored.refresh) });
			await remember(userId, stored.login, g);
			return g.access_token;
		})().finally(() => refreshing.delete(userId));
		refreshing.set(userId, p);
	}
	return p;
}

// "Firefox on Linux", from the User-Agent, so the sessions list is recognisable.
export function describeUa(ua: string | null) {
	if (!ua) return '';
	const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
	return os ? `${browser} on ${os}` : browser;
}
