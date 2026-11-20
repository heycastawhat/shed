import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createToken, signIn, startSession } from '#lib/server/accounts.js';
import { openDb } from '#lib/server/db.js';
import { testEnv } from '#lib/server/test-env.js';

const base = '/ada/empty';
const title = 'Track setup before the first commit';
const body = 'The repository has no commits yet.';
let root: string;
let server: ReturnType<typeof startServer> | undefined;
let origin: string;
let cookie: string;

function startServer(root: string) {
	return Bun.spawn([process.execPath, '-e', `
		import { createServer } from 'vite';
		const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, ws: false } });
		await server.listen();
		console.log(server.resolvedUrls.local[0]);
	`], {
		env: { ...process.env, ...Object.fromEntries(Object.entries(testEnv()).map(([key, value]) => [key, value?.toString()])), SHED_DATA: root, FORGE_DATA: root },
		stdout: 'pipe',
		stderr: 'inherit'
	});
}

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-empty-repo-`);
	const db = openDb(`${root}/shed.db`);
	const user = signIn(db, { sub: '1', preferred_username: 'ada' });
	cookie = `shed_session=${startSession(db, user, 'test')}`;
	const token = createToken(db, user, { name: 'test', scopes: ['repo:read', 'repo:write'] });
	db.close();

	server = startServer(root);
	const reader = server.stdout.getReader();
	const { value } = await reader.read();
	reader.releaseLock();
	origin = new URL(new TextDecoder().decode(value).trim()).origin;

	const post = (path: string, data: object) => fetch(`${origin}/api/v1${path}`, {
		method: 'POST',
		headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	const repo = await post('/user/repos', { name: 'empty', auto_init: false });
	expect(repo.status).toBe(201);
	expect(await repo.json()).toMatchObject({ empty: true });
	const issue = await post(`/repos${base}/issues`, { title, body });
	expect(issue.status).toBe(201);
	expect(await issue.json()).toMatchObject({ number: 1 });
}, 30_000);

afterAll(async () => {
	server?.kill();
	await server?.exited;
	if (root) await rm(root, { recursive: true, force: true });
});

async function html(path = '') {
	const response = await fetch(`${origin}${base}${path}`, { headers: { cookie }, redirect: 'manual' });
	expect(response.status).toBe(200);
	return response.text();
}

test('the Code landing page still gives first-push instructions', async () => {
	expect(await html()).toContain('git push -u origin main');
});

test('an issue created before the first commit is linked from the list', async () => {
	const list = await html('/issues');
	let listedTitle = '';
	new HTMLRewriter().on(`a[href="${base}/issues/1"] strong`, {
		text(chunk) { listedTitle += chunk.text; }
	}).transform(list);
	expect(listedTitle).toBe(title);
	expect(list).not.toContain('This repository is empty');
});

test('the direct issue URL renders the conversation before the first commit', async () => {
	const detail = await html('/issues/1');
	expect(detail).toContain(`<p>${body}</p>`);
	expect(detail).not.toContain('This repository is empty');
});

test.each([
	['/pulls', 'No open pull requests'],
	['/actions', 'No workflow runs yet'],
	['/projects', 'No projects yet'],
	['/wiki', 'This wiki has no pages yet'],
	['/activity', '/issues/1'],
	['/settings', 'Danger zone']
])('%s renders its own content before the first commit', async (path, content) => {
	const page = await html(path);
	expect(page).toContain(content);
	expect(page).not.toContain('This repository is empty');
});
