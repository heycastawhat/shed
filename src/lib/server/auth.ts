import { error, type Cookies } from '@sveltejs/kit';
import { FORGEJO_URL, FORGEJO_CLIENT_ID, FORGEJO_CLIENT_SECRET } from '$app/env/private';
import { decrypt, encrypt, read, sha256, update } from './store.js';

// Cookies on localhost are shared across ports, so use a name other dev apps won't collide with.
const SESSION = 'forge_session';

type Grant = { access_token: string; refresh_token: string; expires_in: number };
const MONTH = 60 * 60 * 24 * 30;

export function authorizeUrl(redirectUri: string, state: string) {
	const url = new URL('/login/oauth/authorize', FORGEJO_URL);
	url.search = new URLSearchParams({
		client_id: FORGEJO_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		state
	}).toString();
	return url;
}

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
function describe(ua: string | null) {
	if (!ua) return undefined;
	const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
	return os ? `${browser} on ${os}` : browser;
}

export async function startSession(cookies: Cookies, g: Grant, ua: string | null = null) {
	const res = await fetch(new URL('/api/v1/user', FORGEJO_URL), { headers: { authorization: `Bearer ${g.access_token}` } });
	if (!res.ok) error(502, `Forgejo user lookup failed: ${res.status}`);
	const user: { id: number; login: string } = await res.json();
	await remember(user.id, user.login, g);
	const id = crypto.getRandomValues(new Uint8Array(32)).toBase64({ alphabet: 'base64url', omitPadding: true });
	const hash = await sha256(id);
	const now = Date.now();
	await update((d) => {
		d.sessions = d.sessions.filter((s) => now - Date.parse(s.createdAt) < MONTH * 1000);
		d.sessions.push({ hash, userId: user.id, createdAt: new Date(now).toISOString(), ua: describe(ua) });
	});
	cookies.set(SESSION, id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: MONTH });
}

async function sessionUser(cookies: Cookies) {
	const id = cookies.get(SESSION);
	if (!id) return;
	const hash = await sha256(id);
	const s = (await read()).sessions.find((s) => s.hash === hash && Date.now() - Date.parse(s.createdAt) < MONTH * 1000);
	if (!s) cookies.delete(SESSION, { path: '/' });
	return s?.userId;
}

// Ids are a hash prefix: enough to pick a session without exposing anything that could be used as the cookie.
export async function listSessions(cookies: Cookies, userId: number) {
	const id = cookies.get(SESSION);
	const mine = id && (await sha256(id));
	return (await read()).sessions
		.filter((s) => s.userId === userId && Date.now() - Date.parse(s.createdAt) < MONTH * 1000)
		.map((s) => ({ id: s.hash.slice(0, 16), ua: s.ua ?? 'Unknown browser', createdAt: s.createdAt, current: s.hash === mine }))
		.sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt));
}

// Ends one session by id, or every session but this one when id is omitted.
export async function endSessions(cookies: Cookies, userId: number, id?: string) {
	const cookie = cookies.get(SESSION);
	const mine = cookie && (await sha256(cookie));
	await update((d) => (d.sessions = d.sessions.filter((s) => s.userId !== userId || s.hash === mine || (id !== undefined && !s.hash.startsWith(id)))));
}

export async function clearSession(cookies: Cookies) {
	const id = cookies.get(SESSION);
	cookies.delete(SESSION, { path: '/' });
	const hash = id && (await sha256(id));
	if (hash) await update((d) => (d.sessions = d.sessions.filter((s) => s.hash !== hash)));
}

export async function sessionToken(cookies: Cookies) {
	const userId = await sessionUser(cookies);
	if (!userId) return;
	try {
		return await userToken(userId);
	} catch {
		await clearSession(cookies);
	}
}
