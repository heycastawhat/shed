import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { FORGE_DATA, FORGE_SECRET } from '$app/env/private';

export type AgentKey = {
	id: string;
	name: string;
	userId: number;
	login: string;
	repos: string[];
	// Write tools that wait for the owner's approval instead of running straight away.
	ask: string[];
	// Tools a key can't use at all unless its owner turns them on (merging).
	allow?: string[];
	hash: string;
	createdAt: string;
	lastUsedAt: string | null;
};
export type Activity = { at: string; keyId: string; name: string; userId: number; repo: string; action: string };
// Forgejo refresh tokens are single-use and every login for a user shares one chain, so there is one stored grant per user.
// Browser sessions and agent keys both borrow it instead of holding their own.
export type StoredGrant = { login: string; refresh: string };
export type Session = { hash: string; userId: number; createdAt: string; ua?: string };
export type Approval = {
	id: string;
	keyId: string;
	keyName: string;
	userId: number;
	repo: string;
	tool: string;
	args: Record<string, string | number | undefined>;
	status: 'pending' | 'approved' | 'denied' | 'failed';
	result?: string;
	// Why it needs a human, when a repo rule (rather than the key's own setting) caused it.
	reason?: string;
	at: string;
	decidedAt?: string;
};
// A T3 Code server forge drives agents on. `token` is encrypted like the grants.
export type T3Host = { id: string; userId: number; name: string; url: string; token: string; addedAt: string; expiresAt?: string };
// A task started by an @agent mention, until forge has posted its result. `line` is set for a line comment, whose thread the replies go to.
export type Mention = {
	id: string;
	userId: number;
	host: string;
	thread: string;
	url: string;
	repo: string;
	number: number;
	kind: 'pull' | 'issue';
	line?: { path: string; line: string };
	createdAt: string;
	done: boolean;
};
// A T3 task forge started, so its pushes can be credited to it. `branches` are where it was told to push; empty for a task that picks
// its own branch, which is filled in once a PR from the thread's branch is seen. `agent` is the provider's name, e.g. "Codex".
export type AgentTask = { repo: string; branches: string[]; host: string; thread: string; agent: string; userId: number; createdAt: string };
// Per-user UI state, keyed by Forgejo user id: pinned repos, snoozed Home items (key -> until), and dismissed banners.
type Data = {
	keys: AgentKey[];
	t3Hosts: T3Host[];
	activity: Activity[];
	approvals: Approval[];
	mentions: Mention[];
	tasks: AgentTask[];
	grants: Record<number, StoredGrant>;
	sessions: Session[];
	pins: Record<number, string[]>;
	snoozed: Record<number, Record<string, string>>;
	dismissed: Record<number, string[]>;
};

const file = `${FORGE_DATA}/forge.json`;
let data: Promise<Data> | undefined;
let writing = Promise.resolve();

// One shared load: concurrent first callers would otherwise each get their own copy, and changes to the losing one vanish.
export function read() {
	data ??= readFile(file, 'utf8')
		.then(JSON.parse, () => ({}))
		.then((saved) => ({
			keys: [],
			t3Hosts: [],
			activity: [],
			approvals: [],
			mentions: [],
			tasks: [],
			pins: {},
			snoozed: {},
			dismissed: {},
			grants: {},
			sessions: [],
			...saved
		}));
	return data;
}

// Writes are chained and go through a temp file, so concurrent agent calls can't interleave or truncate it.
export async function update(fn: (d: Data) => void) {
	const d = await read();
	fn(d);
	d.activity = d.activity.slice(-500);
	d.approvals = d.approvals.slice(-200);
	d.tasks = d.tasks.slice(-500);
	d.mentions = d.mentions.filter((m) => !m.done).concat(d.mentions.filter((m) => m.done).slice(-50));
	for (const [u, m] of Object.entries(d.snoozed)) d.snoozed[+u] = Object.fromEntries(Object.entries(m).filter(([, until]) => Date.parse(until) > Date.now()));
	for (const u of Object.keys(d.dismissed)) d.dismissed[+u] = d.dismissed[+u].slice(-100);
	writing = writing.then(async () => {
		await mkdir(FORGE_DATA, { recursive: true });
		await writeFile(`${file}.tmp`, JSON.stringify(d), { mode: 0o600 });
		await rename(`${file}.tmp`, file);
	});
	await writing;
}

const aes = crypto.subtle.digest('SHA-256', new TextEncoder().encode(FORGE_SECRET)).then((raw) =>
	crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
);

export async function encrypt(text: string) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes, new TextEncoder().encode(text)));
	return new Uint8Array([...iv, ...sealed]).toBase64();
}

export async function decrypt(blob: string) {
	const bytes = Uint8Array.fromBase64(blob);
	return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aes, bytes.slice(12)));
}

export async function sha256(text: string) {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toHex();
}
