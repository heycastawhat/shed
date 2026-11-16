import { error, isHttpError } from '@sveltejs/kit';
import { T3_TOKEN, T3_URL } from '$app/env/private';
import { api, requirePush, type User } from './forgejo.js';
import { decrypt, encrypt, read, update } from './store.js';

export type Host = { id: string; name: string; url: string; token: string; expiresAt?: string };

// The user's T3 Code servers, plus the one in .env if it's set (it can't be removed from the UI).
export async function hostsFor(userId: number): Promise<Host[]> {
	const mine = await Promise.all(
		(await read()).t3Hosts
			.filter((h) => h.userId === userId)
			.map(async (h) => ({ id: h.id, name: h.name, url: h.url, token: await decrypt(h.token), expiresAt: h.expiresAt }))
	);
	return T3_URL && T3_TOKEN ? [{ id: 'env', name: new URL(T3_URL).host, url: T3_URL, token: T3_TOKEN }, ...mine] : mine;
}

// Hosts are user-supplied URLs fetched server-side. Private addresses are allowed on purpose (T3 normally runs on the LAN or loopback),
// so the guard is only: http(s), no credentials or extras in the URL, and redirects are never followed (see rpc and pair).
function hostUrl(raw: string) {
	const u = URL.parse(raw);
	if (!u || !/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) error(400, 'The host must be a plain http(s) URL');
	return u.origin + u.pathname.replace(/\/+$/, '');
}

export async function addHost(userId: number, name: string, url: string, token: string, expiresAt?: string) {
	const host = { id: crypto.randomUUID(), name, url: hostUrl(url), token };
	await rpc(host, 'server.getConfig', {});
	const record = { ...host, userId, token: await encrypt(token), addedAt: new Date().toISOString(), expiresAt };
	await update((d) => d.t3Hosts.push(record));
}

// Redeems a pairing link from T3's Settings → Connections (`<host>/pair#token=…`, or a hosted one with `?host=`) for a token.
// The link is single-use and lasts 5 minutes; the token lasts 30 days and T3 issues no refresh token, so the host is paired again after that.
export async function pair(link: string) {
	const u = URL.parse(link);
	if (!u) error(400, "That isn't a link");
	const code = new URLSearchParams(u.hash.slice(1)).get('token') ?? u.searchParams.get('token');
	if (!code) error(400, 'That link has no pairing token in it');
	const url = hostUrl(u.searchParams.get('host') ?? u.origin);
	const res = await fetch(`${url}/oauth/token`, {
		method: 'POST',
		redirect: 'manual',
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
			subject_token: code,
			subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap',
			requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
			scope: 'orchestration:read orchestration:operate source-control:write',
			client_label: 'forge'
		})
	}).catch(() => error(502, `Could not reach T3 Code at ${url}`));
	if (!res.ok) error(400, `T3 Code refused the pairing link (${res.status}). Links work once, for 5 minutes; make a new one.`);
	const { access_token, expires_in } = await res.json();
	return { url, token: String(access_token), expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : undefined };
}

export const removeHost = (userId: number, id: string) => update((d) => (d.t3Hosts = d.t3Hosts.filter((h) => !(h.id === id && h.userId === userId))));

export type ModelSelection = { instanceId: string; model: string; options?: { id: string; value: unknown }[] };
export type AgentThread = {
	id: string;
	projectId: string;
	title: string;
	status: string;
	branch: string | null;
	runtimeMode: string;
	modelSelection: ModelSelection;
	activeRunId: string | null;
	latestRunId: string | null;
	pendingRuntimeRequest: { id: string; kind: string; createdAt: string } | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
};
export type TurnItem = {
	type: string;
	status: string;
	title: string | null;
	text?: string;
	input?: string;
	fileName?: string;
	requestKind?: string;
	prompt?: string;
	files?: { path: string; additions: number; deletions: number }[];
	requestId?: string;
	questions?: Question[];
	startedAt: string | null;
};
export type Question = {
	id: string;
	header: string;
	question: string;
	options: { label: string; description: string; value?: string }[];
	multiSelect?: boolean;
};
export type Projection = {
	thread: AgentThread;
	runtimeRequests: { id: string; kind: string; status: string }[];
	visibleTurnItems: { item: TurnItem }[];
};

// T3 Code's WebSocket speaks Effect RPC as JSON (protocol 2, internal to T3, so pin T3's version):
// a request gets Chunk frames for streams, which must be acked, and ends with an Exit frame.
// Effect failures come as a list of causes; the readable part is the error's message.
const failure = (cause: { error?: { message?: string } }[]) => cause.find((c) => c.error?.message)?.error!.message ?? JSON.stringify(cause).slice(0, 300);

async function rpc<T>(host: Host, tag: string, payload: unknown, firstChunkOnly = false): Promise<T> {
	const res = await fetch(`${host.url}/api/auth/websocket-ticket`, { method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${host.token}` } }).catch(() =>
		error(502, `Could not reach T3 Code at ${host.url}`)
	);
	if (!res.ok) error(502, `T3 Code at ${host.name} refused the connection (${res.status})`);
	const { ticket } = await res.json();
	const ws = new WebSocket(`${host.url.replace(/^http/, 'ws')}/ws?wsTicket=${encodeURIComponent(ticket)}&orchestrationProtocol=2`);
	return new Promise((resolve, reject) => {
		// `error()` throws, so failures are built in a try; `done` ignores the close that follows a result.
		let done = false;
		const finish = (fn: () => void) => {
			if (done) return;
			done = true;
			ws.close();
			try {
				fn();
			} catch (e) {
				reject(e);
			}
		};
		ws.onopen = () => ws.send(JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] }));
		ws.onmessage = (e) => {
			const m = JSON.parse(String(e.data));
			if (m._tag === 'Chunk' && firstChunkOnly) finish(() => resolve(m.values[0]));
			else if (m._tag === 'Chunk') ws.send(JSON.stringify({ _tag: 'Ack', requestId: m.requestId }));
			else if (m._tag === 'Exit')
				finish(() => (m.exit._tag === 'Success' ? resolve(m.exit.value) : error(502, `T3 Code: ${failure(m.exit.cause)}`)));
			else if (m._tag === 'Ping') ws.send(JSON.stringify({ _tag: 'Pong' }));
		};
		ws.onerror = () => finish(() => error(502, 'Could not reach T3 Code'));
		ws.onclose = () => finish(() => error(502, 'T3 Code closed the connection'));
	});
}

export type Snapshot = { threads: AgentThread[]; archivedThreads?: AgentThread[]; projects: { id: string; title: string }[] };

export async function shell(host: Host) {
	const { snapshot } = await rpc<{ snapshot: Snapshot }>(
		host,
		'orchestration.subscribeShell',
		{},
		true
	);
	return snapshot;
}

export const projection = (host: Host, threadId: string) => rpc<Projection>(host, 'orchestration.getThreadProjection', { threadId });

type Option = { id: string; label: string; isDefault?: boolean };
type Provider = {
	instanceId: string;
	displayName: string;
	enabled: boolean;
	status: string;
	models: { slug: string; name: string; isLegacy?: boolean; capabilities?: { optionDescriptors?: { id: string; type: string; options?: Option[] }[] } }[];
};
export type ModelChoice = { instanceId: string; provider: string; slug: string; name: string; reasoning?: { id: string; options: Option[] } };

// Current models of every provider that's set up on the host, with their reasoning levels if they have any,
// and the base of the host's own web UI links (a thread is at `<web>/<threadId>`).
export async function config(host: Host): Promise<{ models: ModelChoice[]; web: string }> {
	const { providers, environment } = await rpc<{ providers: Provider[]; environment: { environmentId: string } }>(host, 'server.getConfig', {});
	const models = providers
		.filter((p) => p.enabled && p.status === 'ready')
		.flatMap((p) =>
			p.models
				.filter((m) => !m.isLegacy)
				.map((m) => {
					const r = m.capabilities?.optionDescriptors?.find((d) => d.type === 'select' && d.options);
					return { instanceId: p.instanceId, provider: p.displayName, slug: m.slug, name: m.name, reasoning: r && { id: r.id, options: r.options! } };
				})
		);
	return { models, web: `${host.url}/${encodeURIComponent(environment.environmentId)}` };
}

// A forge repo maps to the T3 project with the same title.
export const projectFor = (snap: Snapshot, repo: string) => snap.projects.find((p) => p.title === repo);

// The first of the user's hosts that has the repo as a project; hosts that are down are skipped.
export async function hostWithProject(userId: number, repo: string) {
	const hosts = await hostsFor(userId);
	const has = await Promise.all(hosts.map((h) => shell(h).then((s) => !!projectFor(s, repo), () => false)));
	return hosts.at(has.indexOf(true));
}

// Starts a task in a fresh T3 worktree off `baseRef`, with the model of your latest T3 thread so forge needs no model settings.
// `repo` is the forge repo (`owner/name`); its T3 project has the name as its title. `pushTo` are the branches the task is told to push to.
export async function startTask(
	host: Host,
	repo: string,
	task: { userId: number; pushTo?: string[]; text: string; title?: string; modelSelection?: ModelSelection; runtimeMode: string; baseRef: string; fromOrigin?: boolean }
) {
	const name = repo.split('/')[1];
	const [snap, { providers }] = await Promise.all([shell(host), rpc<{ providers: Provider[] }>(host, 'server.getConfig', {})]);
	const project = projectFor(snap, name);
	if (!project) error(400, `${host.name} has no T3 project called "${name}"`);
	const latest = [...snap.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
	if (!latest && !task.modelSelection) error(400, 'Start one thread in T3 Code first, so forge knows which model to use');
	const modelSelection = task.modelSelection ?? latest.modelSelection;
	const { threadId } = await rpc<{ threadId: string }>(host, 'orchestration.launchThread', {
		commandId: crypto.randomUUID(),
		projectId: project.id,
		title: (task.title ?? task.text.split('\n')[0]).replace(/^(.{60}\S*).+$/, '$1…'),
		modelSelection,
		runtimeMode: task.runtimeMode,
		interactionMode: 'default',
		workspaceStrategy: { type: 'worktree', baseRef: task.baseRef, startFromOrigin: task.fromOrigin },
		initialMessage: { text: task.text, attachments: [] }
	});
	const provider = providers.find((p) => p.instanceId === modelSelection.instanceId)?.displayName;
	// T3 calls the Claude provider "Claude"; the product, and what its own PR footers say, is Claude Code.
	const agent = provider === 'Claude' ? 'Claude Code' : (provider ?? 'T3 Code');
	await update((d) => d.tasks.push({ repo, branches: task.pushTo ?? [], host: host.id, thread: threadId, agent, userId: task.userId, createdAt: new Date().toISOString() }));
	return threadId;
}

// The forge-started task that pushed to `branch`, for crediting a PR opened at `openedAt`. A task that picked its own branch
// matches if its thread is on that branch now; that's only checked for tasks started in the 3 days before the PR, and remembered.
export async function taskOn(repo: string, branch: string, openedAt: string) {
	// Only tasks from before the PR opened: one started later (Fix with agent, @agent) worked on someone else's PR.
	const tasks = (await read()).tasks.filter((t) => t.repo === repo && Date.parse(t.createdAt) < Date.parse(openedAt));
	const known = tasks.findLast((t) => t.branches.includes(branch));
	if (known) return known;
	for (const t of tasks.filter((t) => !t.branches.length && Date.parse(openedAt) - Date.parse(t.createdAt) < 3 * 86400_000).reverse()) {
		const host = (await hostsFor(t.userId)).find((h) => h.id === t.host);
		const snap = host && (await shell(host).catch(() => null));
		if (snap?.threads.find((x) => x.id === t.thread)?.branch !== branch) continue;
		await update(() => t.branches.push(branch));
		return t;
	}
}

export const dispatch = (host: Host, command: Record<string, unknown>) =>
	rpc<{ sequence: number }>(host, 'orchestration.dispatchCommand', { commandId: crypto.randomUUID(), ...command });

// Every host's snapshot and models, side by side; a host that's down reports its error instead of failing the page.
export async function survey(hosts: Host[]) {
	return Promise.all(
		hosts.map(async (host) => {
			try {
				const [snap, c] = await Promise.all([shell(host), config(host)]);
				return { host, snap, ...c, error: null };
			} catch (e) {
				return { host, snap: null, models: [] as ModelChoice[], web: '', error: isHttpError(e) ? e.body.message : String(e) };
			}
		})
	);
}

export async function hostFor(userId: number, id: unknown) {
	const host = (await hostsFor(userId)).find((h) => h.id === id);
	if (!host) error(404, 'Unknown T3 Code host');
	return host;
}

// Starts the task described by the NewTask form, in `repo` (`owner/name`).
export async function launchFromForm(token: string | undefined, repo: string, form: FormData) {
	const text = String(form.get('text') ?? '').trim();
	if (!text) error(400, 'Describe the task');
	const [{ id: userId }] = await Promise.all([api<User>(token, '/user'), requirePush(token, repo)]);
	const host = await hostFor(userId, form.get('host'));
	const [instanceId, model] = String(form.get('model')).split('/');
	const reasoning = form.get('reasoning');
	const thread = await startTask(host, repo, {
		userId,
		text,
		runtimeMode: String(form.get('mode')),
		baseRef: String(form.get('base')),
		modelSelection: { instanceId, model, options: reasoning ? [{ id: String(form.get('reasoningId')), value: reasoning }] : [] }
	});
	return `agents?host=${encodeURIComponent(host.id)}&thread=${encodeURIComponent(thread)}`;
}

// T3 clones in the background and keeps the project even if the clone fails, so the repo's Agents tab asks for the clone's state.
export type Clone = { projectId: string; phase: 'running' | 'done' | 'failed' | 'cancelled'; percent: number | null; error: string | null };
export const clones = (host: Host) => rpc<Clone[]>(host, 'subscribeProjectClones', {}, true);
export const retryClone = (host: Host, projectId: string) => rpc(host, 'projectClone.retry', { projectId });

// Clones a repo onto the host as a new T3 project, where T3's own UI would put it. Needs the token's source-control:write scope.
export async function cloneProject(host: Host, title: string, remoteUrl: string) {
	const { newProjectsRoot } = await rpc<{ newProjectsRoot: string | null }>(host, 'server.getConfig', {});
	if (!newProjectsRoot) error(400, `${host.name} has no folder for new projects; set one in T3 Code's settings`);
	await rpc(host, 'projectClone.start', {
		projectId: crypto.randomUUID(),
		title,
		createdAt: new Date().toISOString(),
		remoteUrl,
		destinationPath: `${newProjectsRoot.replace(/\/+$/, '')}/${title}`
	});
}
