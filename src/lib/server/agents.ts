import { error } from '@sveltejs/kit';
import { userToken } from './auth.js';
import { read, sha256, update, type AgentKey } from './store.js';

// A key acts as its owner, using the owner's stored Forgejo grant (see userToken), so it keeps working after the browser session ends.
export async function createKey(user: { id: number; login: string }, name: string, repos: string[], ask: string[]) {
	if (!(await read()).grants[user.id]) error(401, 'Log in to forge again');
	const key = `fk_${crypto.getRandomValues(new Uint8Array(32)).toBase64({ alphabet: 'base64url', omitPadding: true })}`;
	const record: AgentKey = {
		id: crypto.randomUUID(),
		name,
		userId: user.id,
		login: user.login,
		repos,
		ask,
		hash: await sha256(key),
		createdAt: new Date().toISOString(),
		lastUsedAt: null
	};
	await update((d) => d.keys.push(record));
	return key;
}

export async function updateKey(userId: number, id: string, patch: Pick<AgentKey, 'name' | 'repos' | 'ask'>) {
	await update((d) => Object.assign(d.keys.find((k) => k.id === id && k.userId === userId) ?? {}, patch));
}

export async function revokeKey(userId: number, id: string) {
	await update((d) => (d.keys = d.keys.filter((k) => !(k.id === id && k.userId === userId))));
}

export async function authenticate(header: string | null) {
	const key = header?.match(/^Bearer (fk_\S+)$/)?.[1];
	const hash = key && (await sha256(key));
	const record = hash && (await read()).keys.find((k) => k.hash === hash);
	if (!record) error(401, 'Missing or unknown forge agent key');
	return { key: record, token: await userToken(record.userId) };
}

export async function logActivity(key: AgentKey, repo: string, action: string) {
	const at = new Date().toISOString();
	await update((d) => {
		d.activity.push({ at, keyId: key.id, name: key.name, userId: key.userId, repo, action });
		Object.assign(d.keys.find((k) => k.id === key.id) ?? {}, { lastUsedAt: at });
	});
}

export const allows = (key: AgentKey, repo: string) => key.repos.includes('*') || key.repos.includes(repo);
