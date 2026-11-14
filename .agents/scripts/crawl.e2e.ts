// Visits every route type in headless Chromium and reports non-2xx responses, uncaught page errors and console errors.
// Needs playwright-core (a devDependency). Run from .agents/tmp after login.sh:
//   bun ../scripts/crawl.e2e.ts                                   (:5173, app.jar)
//   BASE=http://localhost:5174 JAR=app15.jar bun ../scripts/crawl.e2e.ts
// REPO (default ada/sample) and ORG (default kiwi) pick the test data; PR/issue/commit ids are discovered from the list pages.
import { chromium, type Page } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5173';
const repo = process.env.REPO ?? 'ada/sample';
const org = process.env.ORG ?? 'kiwi';
const jar = readFileSync(process.env.JAR ?? 'app.jar', 'utf8');
const session = jar.split('\n').map((l) => l.split('\t')).find((f) => f[5] === 'forge_session')![6];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addCookies([{ name: 'forge_session', value: session, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
let problems: string[] = [];
const origin = new URL(base).origin;
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('response', (r) => r.url().startsWith(origin) && r.status() >= 400 && problems.push(`${r.status()} ${r.url().slice(origin.length)}`));

let failed = 0;
async function visit(path: string) {
	problems = [];
	const res = await page.goto(base + path, { waitUntil: 'networkidle' }).catch((e) => (problems.push(String(e)), null));
	const status = res?.status() ?? 0;
	if (status >= 400) problems.unshift(`status ${status}`);
	if (problems.length) failed++;
	console.log(`${problems.length ? 'FAIL' : 'ok  '} ${status} ${path}${problems.map((p) => '\n     ' + p).join('')}`);
}
async function first(p: Page, path: string, re: RegExp) {
	await p.goto(base + path, { waitUntil: 'networkidle' });
	const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')!));
	return hrefs.map((h) => h.match(re)?.[1]).find(Boolean);
}

const probe = await ctx.newPage();
const r = `/${repo}`;
const sha = await first(probe, `${r}/commits/main`, /\/commit\/([0-9a-f]{40})/);
const pull = await first(probe, `${r}/pulls`, /\/pulls\/(\d+)$/);
const closedPull = await first(probe, `${r}/pulls?state=closed`, /\/pulls\/(\d+)$/);
const issue = await first(probe, `${r}/issues`, /\/issues\/(\d+)$/);
const task = await first(probe, '/agents', /^\/agents\/([^/]+\/[^/?#]+)/);
const file = await first(probe, `${r}/tree/main`, /\/blob\/main\/([^/]+\.(?:ts|md|json|txt))$/);
const dir = await first(probe, `${r}/tree/main`, /\/tree\/main\/([^/]+)$/);
await probe.close();

const paths = [
	'/',
	'/changes',
	'/repos',
	'/new',
	`/${repo.split('/')[0]}`,
	`/${org}`,
	r,
	dir && `${r}/tree/main/${dir}`,
	file && `${r}/blob/main/${file}`,
	`${r}/blob/main/README.md`,
	`${r}/blob/main/logo.png`,
	`${r}/raw/main/README.md`,
	`${r}/commits/main`,
	sha && `${r}/commit/${sha}`,
	`${r}/branches`,
	`${r}/releases`,
	`${r}/releases?tags`,
	`${r}/actions`,
	`${r}/wiki`,
	`${r}/wiki/Setup`,
	`${r}/activity`,
	`${r}/issues`,
	`${r}/issues?state=closed`,
	`${r}/issues?labels=bug`,
	`${r}/issues?milestone=v0.2`,
	`${r}/issues?assignee=ada`,
	issue && `${r}/issues/${issue}`,
	`${r}/issues/new`,
	`${r}/pulls`,
	`${r}/pulls?state=closed`,
	`${r}/pulls?labels=bug`,
	`${r}/pulls?milestone=v0.2`,
	`${r}/pulls?assignee=ada`,
	...[pull, closedPull].filter(Boolean).flatMap((n) => [`${r}/pulls/${n}`, `${r}/pulls/${n}/files`, `${r}/pulls/${n}/commits`]),
	// 404s by design for a user with no T3 host (the tab is hidden then).
	process.env.T3 && `${r}/agents`,
	'/agents',
	task && `/agents/${task}`,
	'/settings/account',
	'/settings/appearance',
	'/settings/agents',
	'/palette.json'
].filter((p): p is string => !!p);

for (const p of paths) await visit(p);
await browser.close();
console.log(`\n${paths.length} pages, ${failed} with problems`);
process.exit(failed ? 1 : 0);
