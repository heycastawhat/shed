import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testEnv } from './test-env.js';

// The agent features (@agent mentions, Fix with agent, new tasks, pairing) against Shed's in-process API and a fake T3 Code server
// that speaks the slice of T3's Effect RPC over WebSocket that forge uses.

type Thread = Record<string, any>;
const t3 = {
	projects: [{ id: 'p1', title: 'sample' }],
	threads: [] as Thread[],
	launched: [] as Record<string, any>[],
	items: new Map<string, { item: Record<string, unknown> }[]>()
};
const providers = [{ instanceId: 'claude', displayName: 'Claude', enabled: true, status: 'ready', models: [{ slug: 'opus', name: 'Opus' }] }];
const thread = (id: string, extra: Thread = {}): Thread => ({
	id,
	projectId: 'p1',
	title: id,
	status: 'running',
	branch: null,
	runtimeMode: 'auto-accept-edits',
	modelSelection: { instanceId: 'claude', model: 'opus' },
	activeRunId: 'run',
	latestRunId: 'run',
	pendingRuntimeRequest: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...extra
});
t3.threads.push(thread('earlier', { status: 'completed', activeRunId: null, updatedAt: '2026-01-01T00:00:00Z' }));

function answer(tag: string, payload: any) {
	if (tag === 'server.getConfig') return { providers, environment: { environmentId: 'env1' }, newProjectsRoot: '/tmp/projects' };
	if (tag === 'orchestration.subscribeShell') return { kind: 'snapshot', snapshot: { schemaVersion: 1, snapshotSequence: 1, threads: t3.threads, archivedThreads: [], projects: t3.projects } };
	if (tag === 'orchestration.launchThread') {
		const id = `t${t3.launched.length + 1}`;
		t3.launched.push(payload);
		t3.threads.push(thread(id, { title: payload.title }));
		return { threadId: id, resumed: false };
	}
	if (tag === 'orchestration.getThreadProjection') {
		const th = t3.threads.find((t) => t.id === payload.threadId);
		return { thread: th, runtimeRequests: [], visibleTurnItems: t3.items.get(payload.threadId) ?? [] };
	}
	throw new Error(`unexpected ${tag}`);
}

const server = Bun.serve({
	port: 0,
	async fetch(req, srv) {
		const url = new URL(req.url);
		if (url.pathname === '/oauth/token') {
			const form = new URLSearchParams(await req.text());
			return form.get('subject_token') === 'PAIR' ? Response.json({ access_token: 'paired', expires_in: 3600 }) : new Response('no', { status: 401 });
		}
		if (url.pathname === '/api/auth/websocket-ticket')
			return /^Bearer (tok|paired)$/.test(req.headers.get('authorization') ?? '') ? Response.json({ ticket: 'tk' }) : new Response('no', { status: 401 });
		if (url.pathname === '/ws' && url.searchParams.get('wsTicket') === 'tk' && srv.upgrade(req)) return;
		return new Response('not found', { status: 404 });
	},
	websocket: {
		message(ws, raw) {
			const m = JSON.parse(String(raw));
			if (m._tag !== 'Request') return;
			try {
				const value = answer(m.tag, m.payload);
				if (m.tag === 'orchestration.subscribeShell') ws.send(JSON.stringify({ _tag: 'Chunk', requestId: m.id, values: [value] }));
				else ws.send(JSON.stringify({ _tag: 'Exit', requestId: m.id, exit: { _tag: 'Success', value } }));
			} catch (e) {
				ws.send(JSON.stringify({ _tag: 'Exit', requestId: m.id, exit: { _tag: 'Failure', cause: [{ _tag: 'Fail', error: { message: String(e) } }] } }));
			}
		}
	}
});

// Other test files may have loaded these modules with their own env first, so nothing here depends on which env won:
// the host is added like a paired one, and data dirs come from the modules.
mock.module('$app/env/private', testEnv);
const t3url = `http://127.0.0.1:${server.port}`;

const { db, root } = await import('./shed.js');
const { signIn } = await import('./accounts.js');
const { createRepo, getRepo, repoDir } = await import('./repos.js');
const { afterPush, refSnapshot } = await import('./push.js');
const { commitFiles } = await import('./write.js');
const { internalToken } = await import('./api/internal.js');
const { request, api } = await import('./forgejo.js');
const { mention, checkMentions } = await import('./mention.js');
const { fixWithAgent } = await import('./fix.js');
const { launchFromForm, pair, addHost, hostsFor } = await import('./t3.js');
const { read } = await import('./store.js');

let ada: string, reviewer: string, adaId: number, host: string;
const author = { name: 'Ada', email: 'ada@x' };
const post = (token: string, path: string, body: unknown) =>
	request(token, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const comments = (n: number) => api<{ body: string }[]>(ada, `/repos/ada/sample/issues/${n}/comments`);
const lineComments = (n: number) => api<{ body: string; path: string; position: number }[]>(ada, `/repos/ada/sample/pulls/${n}/comments`);
const finish = (id: string, text: string) => {
	Object.assign(t3.threads.find((t) => t.id === id)!, { status: 'completed', activeRunId: null, updatedAt: new Date().toISOString() });
	t3.items.set(id, [{ item: { type: 'assistant_message', text } }]);
};

beforeAll(async () => {
	adaId = signIn(db, { sub: '1', preferred_username: 'ada' });
	const reviewerId = signIn(db, { sub: '2', preferred_username: 'reviewer' });
	ada = internalToken(adaId);
	await addHost(adaId, 'desk', t3url, 'tok');
	host = (await hostsFor(adaId)).find((h) => h.url === t3url)!.id;
	reviewer = internalToken(reviewerId);
	const dir = repoDir(root, await createRepo(db, root, adaId, { name: 'sample', private: false }));
	const base = await commitFiles(dir, { branch: 'main', parent: null, changes: [{ path: 'a.txt', content: 'one\ntwo\nthree\n' }], message: 'first', author });
	await commitFiles(dir, { branch: 'feature', parent: base, changes: [{ path: 'a.txt', content: 'one\n2\nthree\nfour\n' }], message: 'second', author, newBranch: true });
	await post(ada, '/repos/ada/sample/issues', { title: 'Make it faster', body: 'It is slow.' });
	await post(ada, '/repos/ada/sample/pulls', { title: 'Numbers', head: 'feature', base: 'main' });
});
afterAll(() => server.stop(true));

const where = (index: number) => ({ owner: 'ada', repo: 'sample', index: String(index) });

test('@agent on an issue starts a task on a new branch and posts its summary back', async () => {
	expect(await mention(ada, 'http://shed', where(1), '@agent please look')).toBeUndefined();
	const run = t3.launched.at(-1)!;
	expect(run.projectId).toBe('p1');
	expect(run.modelSelection).toEqual({ instanceId: 'claude', model: 'opus' });
	expect(run.workspaceStrategy).toEqual({ type: 'worktree', baseRef: 'main', startFromOrigin: true });
	expect(run.initialMessage.text).toContain('ada asked you on issue #1 ("Make it faster")');
	expect(run.initialMessage.text).toContain('`git push origin HEAD:agent/issue-1-make-it-faster`');
	expect((await comments(1)).at(-1)!.body).toContain(`On it: [follow the task](http://shed/agents/${host}/t1)`);

	await checkMentions();
	expect(await comments(1)).toHaveLength(1);
	finish('t1', 'Made it faster.');
	await checkMentions();
	expect((await comments(1)).at(-1)!.body).toStartWith(`Done ([task](http://shed/agents/${host}/t1)):\n\nMade it faster.\n\n<sub>Claude Code, an agent acting for @ada`);
	expect((await read()).mentions.find((m) => m.thread === 't1')?.done).toBe(true);
});

test('@agent on a PR works on its branch; on a line it quotes the code and replies in the thread', async () => {
	await mention(ada, 'http://shed', where(2), 'what is this? @agent');
	expect(t3.launched.at(-1)!.workspaceStrategy.baseRef).toBe('feature');
	expect(t3.launched.at(-1)!.initialMessage.text).toContain('`git push origin HEAD:feature`');
	expect((await comments(2)).at(-1)!.body).toContain('On it');

	await post(ada, '/repos/ada/sample/pulls/2/reviews', { event: 'COMMENT', comments: [{ path: 'a.txt', body: '@agent why 2?', new_position: 2 }] });
	await mention(ada, 'http://shed', where(2), '@agent why 2?', { path: 'a.txt', line: 'new:2' });
	const text = t3.launched.at(-1)!.initialMessage.text;
	expect(text).toContain('This was a comment on a.txt, line 2.');
	expect(text).toContain('```diff\n one\n-two\n+2\n```');
	const thread = (await lineComments(2)).filter((c) => c.path === 'a.txt' && c.position === 2);
	expect(thread.map((c) => c.body.split('\n')[0])).toEqual(['@agent why 2?', `On it: [follow the task](http://shed/agents/${host}/t3).`]);
});

test("a line reply whose line left the diff goes to the conversation instead", async () => {
	const id = t3.launched.length;
	finish(`t${id - 1}`, 'Answered.');
	// The agent's push removed the commented line from the diff.
	const repo = getRepo(db, 'ada', 'sample')!;
	const dir = repoDir(root, repo.id);
	const before = await refSnapshot(dir);
	const head = (await api<{ head: { sha: string } }>(ada, '/repos/ada/sample/pulls/2')).head.sha;
	await commitFiles(dir, { branch: 'feature', parent: head, changes: [{ path: 'a.txt', content: 'one\ntwo\nthree\n' }, { path: 'b.txt', content: 'four\n' }], message: 'move', author });
	await afterPush(db, root, repo, adaId, before);
	finish(`t${id}`, 'Because.');
	await checkMentions();
	const bodies = (await comments(2)).map((c) => c.body);
	expect(bodies.some((b) => b.startsWith(`Done ([task](http://shed/agents/${host}/t2)):\n\nAnswered.`))).toBe(true);
	expect(bodies.some((b) => b.includes('a.txt, line 2') && b.includes('Because.'))).toBe(true);
	expect((await read()).mentions.every((m) => m.done)).toBe(true);
});

test("@agent needs write access and a host with the repo's project", async () => {
	expect(await mention(reviewer, 'http://shed', where(1), '@agent hi')).toMatchObject({ error: expect.stringContaining('write access') });
	t3.projects[0].title = 'other';
	expect(await mention(ada, 'http://shed', where(1), '@agent hi')).toMatchObject({ error: expect.stringContaining('project called "sample"') });
	t3.projects[0].title = 'sample';
	expect(await mention(ada, 'http://shed', where(1), 'no mention here')).toBeUndefined();
});

test('Fix with agent hands a review thread to a task on the PR branch', async () => {
	const review = await post(reviewer, '/repos/ada/sample/pulls/2/reviews', { event: 'COMMENT', comments: [{ path: 'b.txt', body: 'Spell it out', new_position: 1 }] });
	const c = (await lineComments(2)).find((c) => c.body === 'Spell it out') as unknown as { id: number };
	const form = new FormData();
	form.set('review', String(review.id));
	form.set('comment', String(c.id));
	const redirect = await fixWithAgent(ada, 'ada', 'sample', '2', form).catch((e) => e);
	const id = t3.threads.at(-1)!.id;
	expect(redirect).toMatchObject({ status: 303, location: `/ada/sample/agents?thread=${id}` });
	const run = t3.launched.at(-1)!;
	expect(run.title).toBe('#2 b.txt: Spell it out');
	expect(run.workspaceStrategy).toEqual({ type: 'worktree', baseRef: 'feature', startFromOrigin: true });
	expect(run.initialMessage.text).toContain('b.txt, line 1\nreviewer wrote: Spell it out');
	expect(run.initialMessage.text).toContain('+four');
	expect((await read()).tasks.at(-1)).toMatchObject({ repo: 'ada/sample', branches: ['feature'], thread: id, agent: 'Claude Code' });
});

test('a new task from the form uses the chosen model, mode and base', async () => {
	const form = new FormData();
	for (const [k, v] of Object.entries({ text: 'Add a README', host: '', model: 'claude/opus', mode: 'full-access', base: 'main', reasoning: 'high', reasoningId: 'effort' })) form.set(k, v);
	form.set('host', host);
	const to = await launchFromForm(ada, 'ada/sample', form);
	const id = t3.threads.at(-1)!.id;
	expect(to).toBe(`agents?host=${host}&thread=${id}`);
	expect(t3.launched.at(-1)).toMatchObject({
		title: 'Add a README',
		runtimeMode: 'full-access',
		modelSelection: { instanceId: 'claude', model: 'opus', options: [{ id: 'effort', value: 'high' }] },
		workspaceStrategy: { type: 'worktree', baseRef: 'main' },
		initialMessage: { text: 'Add a README' }
	});
	expect(await launchFromForm(reviewer, 'ada/sample', form).catch((e) => e.status)).toBe(403);
});

test('a pairing link becomes a stored host', async () => {
	await expect(pair(`http://127.0.0.1:${server.port}/pair#token=WRONG`)).rejects.toMatchObject({ status: 400 });
	const h = await pair(`http://127.0.0.1:${server.port}/pair#token=PAIR`);
	expect(h).toMatchObject({ url: `http://127.0.0.1:${server.port}`, token: 'paired' });
	await addHost(adaId, 'laptop', h.url, h.token, h.expiresAt);
	expect((await hostsFor(adaId)).map((x) => [x.name, x.token])).toEqual([
		['desk', 'tok'],
		['laptop', 'paired']
	]);
});
