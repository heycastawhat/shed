import type { Database } from 'bun:sqlite';
import { createToken } from './accounts.js';

// Sign-in for the Android app: OAuth's code flow with PKCE, with Shed as the provider. The app opens /login/app in a browser tab, the person
// signs in as usual and allows it, and Shed redirects to the app with a one-time code that only the app's PKCE verifier can redeem for a token.
export const APP_REDIRECT = 'shed://callback';
const TTL = 2 * 60 * 1000;
const codes = new Map<string, { userId: number; challenge: string; expires: number }>();
const b64 = (bytes: Uint8Array) => bytes.toBase64({ alphabet: 'base64url', omitPadding: true });

export const validChallenge = (c: string | null): c is string => !!c && /^[A-Za-z0-9_-]{43}$/.test(c);

export function issueCode(userId: number, challenge: string) {
	const now = Date.now();
	for (const [k, v] of codes) if (v.expires < now) codes.delete(k);
	const code = b64(crypto.getRandomValues(new Uint8Array(32)));
	codes.set(code, { userId, challenge, expires: now + TTL });
	return code;
}

// Single use: the code is gone whether or not the verifier matches.
export async function redeemCode(db: Database, code: string, verifier: string, device: string) {
	const c = codes.get(code);
	codes.delete(code);
	if (!c || c.expires < Date.now() || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
	const digest = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
	if (digest !== c.challenge) return null;
	const name = `Android app${device.trim() ? ` (${device.trim().slice(0, 60)})` : ''}`;
	return { userId: c.userId, token: createToken(db, c.userId, { name, scopes: ['repo:read', 'repo:write'] }) };
}
