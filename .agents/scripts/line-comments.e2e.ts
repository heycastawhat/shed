// Drives line comments in headless Chromium and screenshots to .agents/tmp.
// Needs playwright-core (not a project dep): `cd .agents/tmp && bun add playwright-core@1.56.1`, then
// `bun .agents/tmp/../scripts/line-comments.e2e.ts` from .agents/tmp. Posts a real comment on PR #1 — delete it after.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const out = new URL('../tmp', import.meta.url).pathname;
const jar = readFileSync(`${out}/app.jar`, 'utf8');
const session = jar.split('\n').map((l) => l.split('\t')).find((f) => f[5] === 'forge_session')!;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1200, height: 900 } });
await ctx.addCookies([{ name: 'forge_session', value: session[6], domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5173/ada/sample/pulls/1/files', { waitUntil: 'networkidle' });
const row = page.locator('#file-0 tr', { hasText: 'now with a PR' });
await row.hover();
await row.locator('.plus').click();
const box = page.locator('textarea[name=body]');
console.log('textarea focused:', await box.evaluate((el) => el === document.activeElement));
await page.keyboard.type('UI test: **hello** from Playwright');
await box.press('Control+Enter');
await page.locator('.thread-box', { hasText: 'hello from Playwright' }).waitFor({ timeout: 10000 });
console.log('composer closed after send:', (await page.locator('textarea[name=body]').count()) === 0);

await page.getByRole('button', { name: 'Split' }).click();
console.log('threads in split view:', await page.locator('tr.thread').count());
await page.locator('#file-0').screenshot({ path: out + '/split.png' });
await page.getByRole('button', { name: 'Unified' }).click();
await page.locator('#file-5').screenshot({ path: out + '/unified.png' });

const target = page.locator('#file-5 tr', { hasText: 'REFRESH_MARGIN = 60_000' }).first();
await target.hover();
await target.locator('.plus').click();
await page.locator('textarea[name=body]').press('Escape');
console.log('escape closes composer:', (await page.locator('textarea[name=body]').count()) === 0);

console.log('errors:', errors);
await browser.close();
