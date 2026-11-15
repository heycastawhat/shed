import { error } from '@sveltejs/kit';
import type { Claims } from './accounts.js';

export type Provider = { issuer: string; clientId: string; clientSecret: string };
type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string };

const b64 = (bytes: Uint8Array) => bytes.toBase64({ alphabet: 'base64url', omitPadding: true });
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));

const discovered = new Map<string, Promise<Discovery>>();
function discover(issuer: string) {
	let d = discovered.get(issuer);
	if (!d) {
		d = fetch(`${issuer}/.well-known/openid-configuration`).then(async (r) => {
			if (!r.ok) throw new Error(`OIDC discovery at ${issuer} returned ${r.status}`);
			const doc: Discovery = await r.json();
			if (doc.issuer.replace(/\/+$/, '') !== issuer) throw new Error(`OIDC issuer mismatch: ${doc.issuer} is not ${issuer}`);
			return doc;
		});
		d.catch(() => discovered.delete(issuer));
		discovered.set(issuer, d);
	}
	return d;
}

// What the browser carries from /login to the callback, in a short-lived httpOnly cookie.
export type Pending = { state: string; nonce: string; verifier: string; next?: string };

// Where to go after signing in: a path on this site only, never another origin.
export const safeNext = (s: string | null | undefined) => (s && /^\/(?![/\\])/.test(s) ? s : undefined);

export async function authorize(p: Provider, redirectUri: string) {
	const d = await discover(p.issuer).catch((e) => error(502, `Can't reach the sign-in provider: ${e.message}`));
	const pending: Pending = { state: random(), nonce: random(), verifier: random() };
	const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending.verifier))));
	const url = new URL(d.authorization_endpoint);
	url.search = new URLSearchParams({
		client_id: p.clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid profile email',
		state: pending.state,
		nonce: pending.nonce,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	}).toString();
	return { url, pending };
}

// The ID token comes straight from the token endpoint over TLS with the client secret, so its signature isn't checked
// (OIDC Core 3.1.3.7 allows this for the code flow); its issuer, audience, expiry and nonce are.
export async function exchange(p: Provider, redirectUri: string, code: string, pending: Pending): Promise<Claims> {
	const d = await discover(p.issuer);
	const res = await fetch(d.token_endpoint, {
		method: 'POST',
		headers: { accept: 'application/json', authorization: `Basic ${btoa(`${encodeURIComponent(p.clientId)}:${encodeURIComponent(p.clientSecret)}`)}` },
		body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: pending.verifier })
	});
	if (!res.ok) error(502, `Sign-in failed at the provider (${res.status})`);
	const { id_token } = (await res.json()) as { id_token?: string };
	const part = id_token?.split('.')[1];
	if (!part) error(502, 'The sign-in provider sent no ID token');
	const c = JSON.parse(new TextDecoder().decode(Uint8Array.fromBase64(part, { alphabet: 'base64url' })));
	const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
	if (String(c.iss).replace(/\/+$/, '') !== p.issuer || !aud.includes(p.clientId) || !(c.exp * 1000 > Date.now()) || c.nonce !== pending.nonce || typeof c.sub !== 'string')
		error(400, 'The sign-in response was invalid; try again');
	return c;
}
