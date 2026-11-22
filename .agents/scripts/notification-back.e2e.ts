// From the repository root, run after bun --bun run build:
// CHROMIUM=/path/to/chrome bun .agents/scripts/notification-back.e2e.ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { chromium, type Browser } from 'playwright-core';
import { createToken, signIn, startSession } from '../../src/lib/server/accounts.js';
import { openDb } from '../../src/lib/server/db.js';

const root = await mkdtemp(join(tmpdir(), 'shed-notification-back-'));
const server = Bun.spawn([process.execPath, 'build/index.js'], {
	env: {
		PATH: process.env.PATH,
		HOST: '127.0.0.1',
		PORT: '0',
		SHED_DATA: root,
		FORGE_DATA: root,
		FORGE_SECRET: crypto.randomUUID(),
		SHED_SSH_PORT: '0',
		SHED_OIDC_ISSUER: 'http://127.0.0.1:9',
		SHED_OIDC_CLIENT_ID: 'scratch',
		SHED_OIDC_CLIENT_SECRET: 'scratch',
		SHED_ALLOWED_USERS: 'user:alice,user:bob'
	},
	stdout: 'pipe',
	stderr: 'inherit'
});
const log = createInterface({ input: Readable.fromWeb(server.stdout) });
let browser: Browser | undefined;
try {
	let origin = '';
	for await (const line of log) {
		const listening = /^Listening on (http:\/\/127\.0\.0\.1:\d+)$/.exec(line);
		if (listening) { origin = listening[1]; break; }
	}
	assert.ok(origin, 'The scratch server did not start; build Shed first');

	const db = openDb(join(root, 'shed.db'));
	const alice = signIn(db, { sub: 'alice', preferred_username: 'alice' });
	const bob = signIn(db, { sub: 'bob', preferred_username: 'bob' });
	const token = createToken(db, alice, { name: 'Browser test', scopes: ['repo:read', 'repo:write'] });
	const session = startSession(db, bob);
	db.close();
	async function post(path: string, body: Record<string, unknown>) {
		const res = await fetch(`${origin}/api/v1${path}`, {
			method: 'POST',
			headers: { authorization: `token ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		assert.ok(res.ok, `Fixture POST ${path} failed: ${res.status}`);
		return res.json();
	}
	const repo = '/alice/history-scratch';
	await post('/user/repos', { name: 'history-scratch', private: false, auto_init: true });
	const title = 'Scratch unread mention';
	const { number } = await post(`/repos${repo}/issues`, { title, body: 'cc @bob' }) as { number: number };

	browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--disable-back-forward-cache'] });
	const context = await browser.newContext();
	await context.addCookies([{ name: 'shed_session', value: session, url: origin }]);
	const page = await context.newPage();
	page.setDefaultTimeout(5000);
	const badge = page.locator('aside a[href="/notifications"] .badge');
	const row = page.locator('li').filter({ has: page.getByRole('link', { name: title }) });
	const unreadDot = row.locator('[title="Unread"]');
	await page.goto(`${origin}/notifications`);
	await unreadDot.waitFor();
	assert.equal(await badge.textContent(), '1');
	await row.getByRole('link', { name: title }).click();
	await page.waitForURL(`${origin}${repo}/issues/${number}`);
	await badge.waitFor({ state: 'hidden' });

	await page.goBack();
	assert.equal(page.url(), `${origin}/notifications`);
	const navigation = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type);
	assert.equal(navigation, 'back_forward');
	await row.waitFor({ state: 'hidden' });
	await badge.waitFor({ state: 'hidden' });
	await page.getByRole('link', { name: 'All', exact: true }).click();
	await row.waitFor();
	assert.equal(await unreadDot.count(), 0);
	assert.equal(await badge.count(), 0);
	console.log('Browser Back kept the notification read and the sidebar badge clear.');
} finally {
	await browser?.close();
	log.close();
	server.kill('SIGKILL');
	await server.exited;
	await rm(root, { recursive: true, force: true });
}
