import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getUser, signIn } from '../accounts.js';
import { openDb } from '../db.js';
import { createRepo } from '../repos.js';
import { testEnv } from '../test-env.js';

// /notifications/stream pushes each notification to the people it's for, as it's written.

let root: string, db: Database, owner: number, other: number;
let dispatch: typeof import('./index.js').dispatch;
mock.module('$app/env/private', testEnv);

const req = (as: number, method: string, path: string, body?: unknown, signal?: AbortSignal) =>
	dispatch(
		db,
		root,
		'http://shed',
		new Request(`http://shed/api/v1${path}`, { method, signal, body: body && JSON.stringify(body), headers: body ? { 'content-type': 'application/json' } : {} }),
		{ user: getUser(db, as)!, token: null }
	);

beforeAll(async () => {
	({ dispatch } = await import('./index.js'));
	root = await mkdtemp(`${tmpdir()}/shed-stream-`);
	db = openDb(':memory:');
	owner = signIn(db, { sub: '1', preferred_username: 'ada' });
	other = signIn(db, { sub: '2', preferred_username: 'other' });
	await createRepo(db, root, owner, { name: 'sample', private: false });
});
afterAll(() => rm(root, { recursive: true, force: true }));

test('a comment reaches the subscriber’s stream, not the commenter’s', async () => {
	const issue = await (await req(owner, 'POST', '/repos/ada/sample/issues', { title: 'Broken' })).json();
	const ac = new AbortController();
	const res = await req(owner, 'GET', '/notifications/stream', undefined, ac.signal);
	expect(res.headers.get('content-type')).toBe('text/event-stream');
	const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
	const events: string[] = [];
	const read = async () => {
		while (!events.some((e) => e.includes('event: notification'))) events.push((await reader.read()).value ?? '');
	};
	expect((await reader.read()).value).toContain('event: ready');
	await req(other, 'POST', `/repos/ada/sample/issues/${issue.number}/comments`, { body: 'Same here @ada' });
	await Promise.race([read(), Bun.sleep(2000).then(() => Promise.reject(new Error('no event')))]);
	const data = JSON.parse(events.join('').match(/event: notification\ndata: (.*)\n/)![1]);
	expect(data).toMatchObject({ number: issue.number, actor: 'other', what: 'commented', text: 'Same here @ada', unread: true, subject: { title: 'Broken', type: 'Issue' } });
	ac.abort();
	await reader.cancel();
});
