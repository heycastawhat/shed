import { beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openDb } from './db.js';
import { signIn, tokenAuth } from './accounts.js';
import { issueCode, redeemCode, validChallenge } from './appauth.js';
import { safeNext } from './oidc.js';

let db: Database;
let user: number;
beforeEach(() => {
	db = openDb(':memory:');
	user = signIn(db, { sub: '1', preferred_username: 'ada' });
});

const verifier = 'v'.repeat(43) + 'erifier-with-allowed._~chars';
const challengeOf = async (v: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))).toBase64({ alphabet: 'base64url', omitPadding: true });

test('a code redeems once, with the right verifier, for a working token', async () => {
	const challenge = await challengeOf(verifier);
	expect(validChallenge(challenge)).toBe(true);
	const code = issueCode(user, challenge);
	const r = await redeemCode(db, code, verifier, 'Pixel 9');
	expect(r?.userId).toBe(user);
	expect(tokenAuth(db, r!.token)).toMatchObject({ userId: user, scopes: ['repo:read', 'repo:write'] });
	expect(db.query('select name from tokens').get()).toEqual({ name: 'Android app (Pixel 9)' });
	expect(await redeemCode(db, code, verifier, '')).toBeNull();
});

test('a wrong verifier burns the code', async () => {
	const code = issueCode(user, await challengeOf(verifier));
	expect(await redeemCode(db, code, 'x'.repeat(43), '')).toBeNull();
	expect(await redeemCode(db, code, verifier, '')).toBeNull();
});

test('only same-site paths are followed after sign-in', () => {
	expect(safeNext('/login/app?x=1')).toBe('/login/app?x=1');
	for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '', null]) expect(safeNext(bad)).toBeUndefined();
});
