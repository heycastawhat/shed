import { error, json } from '@sveltejs/kit';
import { getUser } from '#lib/server/accounts.js';
import { redeemCode } from '#lib/server/appauth.js';
import { db } from '#lib/server/shed.js';

export async function POST({ request }) {
	const b = (await request.json().catch(() => null)) as { code?: unknown; code_verifier?: unknown; device?: unknown } | null;
	if (typeof b?.code !== 'string' || typeof b.code_verifier !== 'string') error(400, 'Send code and code_verifier');
	const r = await redeemCode(db, b.code, b.code_verifier, typeof b.device === 'string' ? b.device : '');
	if (!r) error(400, 'This sign-in code expired or was already used; sign in again');
	return json({ token: r.token, login: getUser(db, r.userId)!.login });
}
