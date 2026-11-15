import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { openDb } from '../db.js';
import { createRepo, repoDir } from '../repos.js';
import { dispatch } from './router.js';
import { deliver, fire, type HookRow } from './hooks.js';
import './issues.js';

let root: string, db: Database, ada: number, other: number, repoId: number, server: ReturnType<typeof Bun.serve>, hookUrl: string;
const got: { headers: Headers; body: string; path: string }[] = [];

const call = async (user: number, method: string, path: string, body?: unknown) => {
	const res = await dispatch(db, root, 'https://shed.test', new Request(`http://shed/api/v1${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), {
		user: getUser(db, user)!,
		token: null
	});
	return { status: res.status, json: res.status === 204 ? null : await res.json() };
};

beforeAll(async () => {
	root = await mkdtemp(`${tmpdir()}/shed-hooks-`);
	db = openDb(':memory:');
	ada = signIn(db, { sub: '1', preferred_username: 'ada' });
	other = signIn(db, { sub: '2', preferred_username: 'other' });
	repoId = await createRepo(db, root, ada, { name: 'sample' });
	server = Bun.serve({
		port: 0,
		fetch: async (req) => {
			const path = new URL(req.url).pathname;
			got.push({ headers: req.headers, body: await req.text(), path });
			if (path === '/moved') return Response.redirect('http://example.invalid/', 302);
			if (path === '/slow') await Bun.sleep(200);
			return new Response('thanks', { status: path === '/fail' ? 500 : 200 });
		}
	});
	hookUrl = `http://localhost:${server.port}`;
});
afterAll(async () => {
	server.stop(true);
	await rm(root, { recursive: true });
});

test('create, list, edit and delete hooks; only admins', async () => {
	expect((await call(ada, 'POST', '/repos/ada/sample/hooks', { type: 'forgejo', config: { url: 'ftp://x' }, events: ['push'] })).status).toBe(422);
	expect((await call(ada, 'POST', '/repos/ada/sample/hooks', { config: { url: hookUrl }, events: ['nope'] })).status).toBe(422);
	const made = await call(ada, 'POST', '/repos/ada/sample/hooks', {
		type: 'forgejo',
		config: { url: `${hookUrl}/a`, content_type: 'json', secret: 's3cret' },
		events: ['push', 'issues'],
		active: true
	});
	expect(made.status).toBe(201);
	expect(made.json).toMatchObject({ type: 'forgejo', config: { url: `${hookUrl}/a`, content_type: 'json' }, events: ['push', 'issues'], active: true });
	expect(JSON.stringify(made.json)).not.toContain('s3cret');
	expect((await call(other, 'GET', '/repos/ada/sample/hooks')).status).toBe(404);
	db.query("insert into collaborators (repo_id, user_id, permission) values (?, ?, 'write')").run(repoId, other);
	expect((await call(other, 'GET', '/repos/ada/sample/hooks')).status).toBe(403);
	const edited = await call(ada, 'PATCH', `/repos/ada/sample/hooks/${made.json.id}`, { events: ['issue_comment'], active: false });
	expect(edited.json).toMatchObject({ events: ['issue_comment'], active: false, config: { url: `${hookUrl}/a` } });
	expect((await call(ada, 'GET', '/repos/ada/sample/hooks')).json).toHaveLength(1);
	expect((await call(ada, 'DELETE', `/repos/ada/sample/hooks/${made.json.id}`)).status).toBe(204);
	expect((await call(ada, 'GET', '/repos/ada/sample/hooks')).json).toHaveLength(0);
});

test('delivery signs the body, sets Forgejo/Gitea/GitHub headers and records the result', async () => {
	const hook = {
		id: Number(db.query("insert into hooks (repo_id, url, secret, events) values (?, ?, 'key', '[\"push\"]')").run(repoId, `${hookUrl}/b`).lastInsertRowid),
		repo_id: repoId,
		url: `${hookUrl}/b`,
		secret: 'key',
		events: '["push"]',
		active: 1,
		created_at: ''
	} as HookRow;
	await deliver(db, hook, 'push', { hello: 'world' });
	const r = got.at(-1)!;
	const sig = new Bun.CryptoHasher('sha256', 'key').update(r.body).digest('hex');
	expect(r.body).toBe('{"hello":"world"}');
	expect(r.headers.get('x-forgejo-event')).toBe('push');
	expect(r.headers.get('x-gitea-event')).toBe('push');
	expect(r.headers.get('x-github-event')).toBe('push');
	expect(r.headers.get('x-hub-signature-256')).toBe(`sha256=${sig}`);
	expect(r.headers.get('x-forgejo-signature')).toBe(sig);
	expect(r.headers.get('x-gitea-signature')).toBe(sig);
	expect(db.query('select event, status, response from hook_deliveries where hook_id = ?').get(hook.id)).toEqual({ event: 'push', status: 200, response: 'thanks' });

	// Redirects aren't followed, and failures are recorded rather than thrown.
	await deliver(db, { ...hook, url: `${hookUrl}/moved` }, 'push', {});
	expect(got.at(-1)!.path).toBe('/moved');
	expect(db.query<{ status: number; response: string }, [number]>('select status, response from hook_deliveries where hook_id = ? order by id desc').get(hook.id)).toMatchObject({
		status: 302,
		response: expect.stringContaining('not followed')
	});
	await deliver(db, { ...hook, url: 'http://127.0.0.1:1/' }, 'push', {});
	expect(db.query<{ status: number | null }, [number]>('select status from hook_deliveries where hook_id = ? order by id desc').get(hook.id)!.status).toBeNull();
	db.query('delete from hooks where id = ?').run(hook.id);
});

test('events fire in the background, only to hooks that want them', async () => {
	const want = Number(db.query('insert into hooks (repo_id, url, events) values (?, ?, \'["issues"]\')').run(repoId, `${hookUrl}/slow`).lastInsertRowid);
	db.query('insert into hooks (repo_id, url, events) values (?, ?, \'["push"]\')').run(repoId, `${hookUrl}/push-only`);
	db.query('insert into hooks (repo_id, url, events, active) values (?, ?, \'["issues"]\', 0)').run(repoId, `${hookUrl}/off`);
	const n = got.length;
	const issue = await call(ada, 'POST', '/repos/ada/sample/issues', { title: 'Broken', body: 'It broke' });
	expect(issue.status).toBe(201);
	// The issue was created without waiting for the slow hook.
	expect(got.length).toBe(n);
	await Bun.sleep(400);
	const sent = got.slice(n);
	expect(sent.map((g) => g.path)).toEqual(['/slow']);
	expect(JSON.parse(sent[0].body)).toMatchObject({
		action: 'opened',
		number: issue.json.number,
		issue: { title: 'Broken' },
		repository: { full_name: 'ada/sample' },
		sender: { login: 'ada' }
	});
	expect(db.query('select count(*) as n from hook_deliveries where hook_id = ?').get(want)).toEqual({ n: 1 });

	// Comments go out as issue_comment with the comment that was just made.
	db.query(`update hooks set events = '["issue_comment"]' where id = ?`).run(want);
	await call(ada, 'POST', `/repos/ada/sample/issues/${issue.json.number}/comments`, { body: 'Fixed now' });
	await Bun.sleep(400);
	expect(JSON.parse(got.at(-1)!.body)).toMatchObject({ action: 'created', comment: { body: 'Fixed now' }, issue: { number: issue.json.number }, is_pull: false });
	expect(fire(db, repoId, 'release', {})).toHaveLength(0);
});

test('a test delivery sends a push of the default branch', async () => {
	const { commitFiles } = await import('../write.js');
	const sha = await commitFiles(repoDir(root, repoId), {
		branch: 'main',
		parent: null,
		changes: [{ path: 'a.txt', content: 'a' }],
		message: 'First\n\nBody',
		author: { name: 'Ada', email: 'j@x.nz' }
	});
	const id = Number(db.query('insert into hooks (repo_id, url, events) values (?, ?, \'["push"]\')').run(repoId, `${hookUrl}/test`).lastInsertRowid);
	expect((await call(ada, 'POST', `/repos/ada/sample/hooks/${id}/tests`)).status).toBe(204);
	expect(JSON.parse(got.at(-1)!.body)).toMatchObject({
		ref: 'refs/heads/main',
		after: sha,
		commits: [{ id: sha, message: 'First\n\nBody', author: { name: 'Ada' } }],
		head_commit: { id: sha }
	});
	expect((await call(ada, 'GET', `/repos/ada/sample/hooks/${id}/deliveries`)).json).toMatchObject([{ event: 'push', status: 200 }]);
});
