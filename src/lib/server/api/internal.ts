// Tokens for calls inside the process (pages and agents acting as a signed-in person). They never leave the server and die with it.
const byToken = new Map<string, number>();
const byUser = new Map<number, string>();

export function internalToken(userId: number) {
	let t = byUser.get(userId);
	if (!t) {
		t = `shedi_${crypto.getRandomValues(new Uint8Array(24)).toBase64({ alphabet: 'base64url', omitPadding: true })}`;
		byUser.set(userId, t);
		byToken.set(t, userId);
	}
	return t;
}

export const internalUser = (token: string | undefined) => (token ? byToken.get(token) : undefined);
