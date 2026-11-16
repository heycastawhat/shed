#!/usr/bin/env bun
// `shed`, a command line client for a Shed server, in the spirit of `gh`. It only talks to /api/v1 with a personal token.
// Build a standalone binary with `bun build --compile cli/shed.ts --outfile shed`.
import { homedir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type Host = { token: string; login: string };
type Json = any;

const HELP = `shed: work with a Shed server from the command line

  auth login [--host h] [--with-token]   save a token (from Settings → Tokens) for a host
  auth status | logout [--host h] | setup-git | token
  repo list [owner] | view | create <name> [--private] [-d desc] | clone <owner/repo> [dir] | delete <owner/repo> --yes
  pr list [-s open|closed|all] [-A author] | view <n> [-c] | diff <n> | checks <n> | checkout <n>
  pr create [-t title] [-b body] [-B base] [-H head] [--draft] [--fill]
  pr merge <n> [--merge|--rebase|--squash|--fast-forward-only] [--auto] [-d] | close <n> | reopen <n> | comment <n> -b text | edit <n> [-t] [-b]
  pr review <n> --approve|--request-changes|--comment [-b text]
  issue list [-s state] [-l label] | view <n> [-c] | create -t title [-b body] [-l label…] | close <n> | reopen <n> | comment <n> -b text
  run list [-L n] | view <id> | cancel <id> | rerun <id>
  api <path> [-X method] [-f key=value …] [--input file]   raw API call, prints JSON
  browse [pr|issue <n>]                                     print the web URL

  -R owner/repo picks the repo (default: the git remote of the current directory). SHED_HOST and SHED_TOKEN override the saved login.`;

// ---------- arguments

const argv = process.argv.slice(2);
const flags: Record<string, string | true | string[]> = {};
const pos: string[] = [];
const valued = new Set(['R', 'repo', 'host', 's', 'state', 'A', 'author', 't', 'title', 'b', 'body', 'B', 'base', 'H', 'head', 'l', 'label', 'X', 'method', 'f', 'field', 'L', 'limit', 'd', 'description', 'input', 'r', 'reviewer', 'org']);
const boolOnly = new Set(['d', 'delete-branch']);
for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	const m = a.match(/^--?([\w-]+)(?:=(.*))?$/);
	if (!m || a === '-') {
		pos.push(a);
		continue;
	}
	const k = m[1];
	let v = (m[2] ?? true) as string | true;
	// -d is a description for `repo create` and "delete branch" for `pr merge`.
	const takes = valued.has(k) && !(boolOnly.has(k) && pos[0] === 'pr');
	if (v === true && takes && i + 1 < argv.length) v = argv[++i];
	const prev = flags[k];
	flags[k] = prev === undefined || prev === true ? v : Array.isArray(prev) ? [...prev, String(v)] : [String(prev), String(v)];
}
const flag = (...names: string[]) => {
	for (const n of names) if (flags[n] !== undefined) return Array.isArray(flags[n]) ? (flags[n] as string[]).at(-1)! : flags[n];
};
const str = (...names: string[]) => {
	const v = flag(...names);
	return typeof v === 'string' ? v : undefined;
};
const list = (...names: string[]) => names.flatMap((n) => (flags[n] === undefined || flags[n] === true ? [] : ([] as string[]).concat(flags[n] as string)));

function die(msg: string): never {
	console.error(msg);
	process.exit(1);
}

// ---------- config and hosts

const configFile = `${process.env.XDG_CONFIG_HOME || `${homedir()}/.config`}/shed/hosts.json`;
const readHosts = (): Record<string, Host> => {
	try {
		return JSON.parse(readFileSync(configFile, 'utf8'));
	} catch {
		return {};
	}
};
const writeHosts = (h: Record<string, Host>) => {
	mkdirSync(dirname(configFile), { recursive: true });
	writeFileSync(configFile, JSON.stringify(h, null, '\t') + '\n', { mode: 0o600 });
};

// "shed.example.com" or "localhost:5173" → a base URL; plain http only for localhost-ish hosts.
const baseUrl = (host: string) => (/^https?:\/\//.test(host) ? host.replace(/\/+$/, '') : `${/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https'}://${host}`);
const hostOf = (s: string) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

const sh = (cmd: string[], opts: { quiet?: boolean } = {}) => {
	const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: opts.quiet ? 'pipe' : 'inherit' });
	return { ok: p.exitCode === 0, out: p.stdout.toString().trim() };
};
const run = (cmd: string[]) => {
	const p = Bun.spawnSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'] });
	if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
};

// The remote of the current checkout: origin first, else any remote that points at a known host.
function remoteRepo(): { host: string; full: string } | undefined {
	const hosts = readHosts();
	const remotes = sh(['git', 'remote', '-v'], { quiet: true }).out.split('\n');
	const parsed = remotes
		.map((l) => l.split(/\s+/))
		.filter((p) => p[2] === '(fetch)')
		.map(([name, url]) => {
			const m = url.match(/^(?:https?:\/\/(?:[^@/]+@)?([^/]+)\/|ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/|[^@]+@([^:]+):)([^/]+\/[^/]+?)(?:\.git)?\/?$/);
			return m ? { name, host: m[1] ?? m[2] ?? m[3], full: m[4] } : undefined;
		})
		.filter((x) => !!x);
	const known = (h: string) => Object.keys(hosts).find((k) => k === h || k.split(':')[0] === h);
	const pick = parsed.find((r) => r.name === 'origin' && known(r.host)) ?? parsed.find((r) => known(r.host)) ?? (Object.keys(hosts).length ? undefined : parsed.find((r) => r.name === 'origin'));
	return pick && { host: known(pick.host) ?? pick.host, full: pick.full };
}

function context() {
	const hosts = readHosts();
	const r = str('R', 'repo');
	const remote = r ? undefined : remoteRepo();
	const host = process.env.SHED_HOST || str('host') || (r && r.includes('/') && r.split('/').length > 2 ? hostOf(r) : undefined) || remote?.host || Object.keys(hosts)[0];
	if (!host) die('Not signed in. Run `shed auth login`.');
	const token = process.env.SHED_TOKEN || hosts[host]?.token;
	const full = r ? r.split('/').slice(-2).join('/') : remote?.full;
	return { host, base: baseUrl(host), token, full };
}

// ---------- HTTP

async function call(method: string, path: string, body?: unknown, ctx = context()): Promise<Json> {
	const res = await fetch(`${ctx.base}/api/v1${path}`, {
		method,
		headers: { ...(ctx.token ? { authorization: `token ${ctx.token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	if (!res.ok) {
		let msg = text;
		try {
			msg = JSON.parse(text).message ?? text;
		} catch {}
		die(`${method} ${path}: ${res.status} ${msg}`.trim());
	}
	if (!text) return null;
	return res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
}
const get = (p: string) => call('GET', p);
const repoPath = () => {
	const { full } = context();
	if (!full) die('No repo here: run inside a clone or pass -R owner/repo.');
	return `/repos/${full}`;
};

// ---------- output

const tty = process.stdout.isTTY;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const [bold, dim, green, red, magenta, yellow] = [c(1), c(2), c(32), c(31), c(35), c(33)];
const ago = (iso: string) => {
	const s = (Date.now() - Date.parse(iso)) / 1000;
	for (const [n, u] of [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']] as const) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
	return 'just now';
};
const table = (rows: string[][]) => {
	const strip = (s: string) => s.replace(/\x1b\[\d+m/g, '');
	const w = rows[0]?.map((_, i) => Math.max(...rows.map((r) => strip(r[i] ?? '').length))) ?? [];
	for (const r of rows) console.log(r.map((x, i) => (i === r.length - 1 ? x : x + ' '.repeat(w[i] - strip(x).length))).join('  '));
};
const stateOf = (x: Json) => (x.merged ? magenta('merged') : x.state === 'open' ? (x.draft ? dim('draft') : magenta('open')) : red('closed'));
const labels = (x: Json) => (x.labels?.length ? ' ' + x.labels.map((l: Json) => dim(`[${l.name}]`)).join(' ') : '');

async function comments(path: string) {
	for (const cm of await get(`${path}/comments`)) console.log(`\n${bold(cm.user.login)} ${dim(ago(cm.created_at))}\n${cm.body}`);
}

const branch = () => sh(['git', 'symbolic-ref', '--short', 'HEAD'], { quiet: true }).out;
const num = (s: string | undefined) => (s && /^#?\d+$/.test(s) ? Number(s.replace('#', '')) : die('Give a number, like `shed pr view 12`.'));

// ---------- commands

const [group, sub, ...rest] = pos;

async function auth() {
	const hosts = readHosts();
	if (sub === 'login') {
		let host = str('host');
		if (!host) {
			const guess = remoteRepo()?.host;
			host = prompt(`Host${guess ? ` (${guess})` : ''}:`) || guess;
		}
		if (!host) die('Give a host.');
		host = hostOf(host);
		const token = flag('with-token') ? (await Bun.stdin.text()).trim() : prompt(`Token (make one at ${baseUrl(host)}/settings/tokens):`)?.trim();
		if (!token) die('No token.');
		const me = await call('GET', '/user', undefined, { host, base: baseUrl(host), token, full: undefined });
		writeHosts({ ...hosts, [host]: { token, login: me.login } });
		console.log(`Signed in to ${host} as ${bold(me.login)}. Run \`shed auth setup-git\` so git uses it too.`);
	} else if (sub === 'logout') {
		const host = str('host') ?? context().host;
		delete hosts[host];
		writeHosts(hosts);
		console.log(`Signed out of ${host}.`);
	} else if (sub === 'status') {
		if (!Object.keys(hosts).length) return console.log('Not signed in to any host.');
		for (const [h, v] of Object.entries(hosts)) {
			const res = await fetch(`${baseUrl(h)}/api/v1/user`, { headers: { authorization: `token ${v.token}` } }).catch(() => undefined);
			console.log(`${bold(h)}: ${v.login} ${res?.ok ? green('✓') : red(res ? `token rejected (${res.status})` : 'unreachable')}`);
		}
	} else if (sub === 'token') console.log(context().token ?? die('No token for this host.'));
	else if (sub === 'setup-git') {
		const self = process.execPath.endsWith('/bun') ? `${process.execPath} ${Bun.main}` : process.execPath;
		for (const h of Object.keys(hosts)) {
			const key = `credential.${baseUrl(h)}.helper`;
			sh(['git', 'config', '--global', '--replace-all', key, '']);
			sh(['git', 'config', '--global', '--add', key, `!${self} auth git-credential`]);
			console.log(`git now signs in to ${h} with your shed token.`);
		}
	} else if (sub === 'git-credential') {
		// git's credential helper protocol: key=value lines in, username/password out for `get`.
		if (rest[0] !== 'get') return;
		const input = Object.fromEntries((await Bun.stdin.text()).split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
		const h = hosts[input.host];
		if (h) console.log(`username=${h.login}\npassword=${h.token}`);
	} else die(HELP);
}

async function repo() {
	if (sub === 'list') {
		const owner = rest[0];
		const repos: Json[] = await get(owner ? `/users/${owner}/repos?limit=100` : '/user/repos?limit=100');
		table(repos.map((r) => [bold(r.full_name), r.private ? dim('private') : '', r.description ?? '', dim(ago(r.updated_at))]));
	} else if (sub === 'view' || !sub) {
		const r = await get(repoPath());
		console.log(`${bold(r.full_name)}${r.private ? dim(' (private)') : ''}${r.fork ? dim(` fork of ${r.parent?.full_name}`) : ''}\n${r.description || dim('No description')}\n`);
		console.log(`${r.html_url}\nclone: ${r.clone_url}  ${r.ssh_url}\ndefault branch: ${r.default_branch} · ${r.open_issues_count} issues · ${r.open_pr_counter} PRs · ${r.stars_count} stars`);
	} else if (sub === 'create') {
		const name = rest[0] ?? die('Usage: shed repo create <name> [--private] [-d description] [--org org]');
		const org = str('org');
		const r = await call('POST', org ? `/orgs/${org}/repos` : '/user/repos', { name, private: !!flag('private'), description: str('d', 'description') ?? '' });
		console.log(`Created ${bold(r.full_name)}: ${r.html_url}\n  git remote add origin ${r.clone_url}`);
	} else if (sub === 'clone') {
		const full = rest[0]?.includes('/') ? rest[0] : rest[0] ? `${hosts()[context().host]?.login}/${rest[0]}` : die('Usage: shed repo clone <owner/repo> [dir]');
		const r = await get(`/repos/${full}`);
		run(['git', 'clone', flag('ssh') ? r.ssh_url : r.clone_url, ...(rest[1] ? [rest[1]] : [])]);
	} else if (sub === 'delete') {
		const full = rest[0] ?? die('Usage: shed repo delete <owner/repo> --yes');
		if (!flag('yes')) die(`This deletes ${full} for good. Add --yes to go ahead.`);
		await call('DELETE', `/repos/${full}`);
		console.log(`Deleted ${full}.`);
	} else die(HELP);
}
const hosts = readHosts;

async function pr() {
	const base = repoPath();
	if (sub === 'list' || !sub) {
		const q = new URLSearchParams({ state: str('s', 'state') ?? 'open', limit: str('L', 'limit') ?? '30' });
		const author = str('A', 'author');
		if (author) q.set('poster', author);
		const prs: Json[] = await get(`${base}/pulls?${q}`);
		if (!prs.length) return console.log('No pull requests.');
		table(prs.map((p) => [`#${p.number}`, stateOf(p), p.title + labels(p), dim(`${p.head.label ?? p.head.ref} → ${p.base.ref}`), dim(ago(p.updated_at))]));
	} else if (sub === 'view') {
		const n = num(rest[0] ?? (await currentPr(base)));
		const p = await get(`${base}/pulls/${n}`);
		console.log(`${bold(p.title)} ${dim(`#${n}`)}\n${stateOf(p)} · ${p.user.login} wants to merge ${p.head.label ?? p.head.ref} into ${p.base.ref} · ${p.additions ?? 0}+ ${p.deletions ?? 0}- in ${p.changed_files ?? '?'} files${labels(p)}`);
		if (p.mergeable === false && p.state === 'open') console.log(red('Conflicts with the base branch'));
		console.log(`\n${p.body || dim('No description')}\n\n${dim(p.html_url)}`);
		if (flag('c', 'comments')) await comments(`${base}/issues/${n}`);
	} else if (sub === 'diff') {
		process.stdout.write(await get(`${base}/pulls/${num(rest[0] ?? (await currentPr(base)))}.${flag('patch') ? 'patch' : 'diff'}`));
	} else if (sub === 'checks') {
		const p = await get(`${base}/pulls/${num(rest[0] ?? (await currentPr(base)))}`);
		const s = await get(`${base}/commits/${p.head.sha}/status`);
		if (!s.statuses?.length) return console.log('No checks.');
		const mark = (st: string) => (st === 'success' ? green('✓') : st === 'pending' ? yellow('•') : red('✗'));
		table(s.statuses.map((x: Json) => [mark(x.status), x.context, dim(x.description ?? ''), dim(x.target_url ?? '')]));
		if (s.state !== 'success') process.exitCode = s.state === 'pending' ? 8 : 1;
	} else if (sub === 'checkout') {
		const n = num(rest[0]);
		const p = await get(`${base}/pulls/${n}`);
		const remote = sh(['git', 'remote'], { quiet: true }).out.split('\n').includes('origin') ? 'origin' : die('No `origin` remote.');
		const local = str('b', 'branch') ?? (p.head.repo?.full_name && p.head.repo.full_name !== p.base.repo?.full_name ? `pr-${n}` : p.head.ref);
		run(['git', 'fetch', remote, `+refs/pull/${n}/head:refs/remotes/${remote}/pr/${n}`]);
		if (sh(['git', 'rev-parse', '--verify', '--quiet', `refs/heads/${local}`], { quiet: true }).ok) run(['git', 'checkout', local]), run(['git', 'merge', '--ff-only', `${remote}/pr/${n}`]);
		else run(['git', 'checkout', '-b', local, `${remote}/pr/${n}`]);
		if (local === p.head.ref) sh(['git', 'branch', `--set-upstream-to=${remote}/${p.head.ref}`], { quiet: true });
	} else if (sub === 'create') {
		const r = await get(base);
		const head = str('H', 'head') ?? branch() ?? die('Not on a branch; pass -H.');
		const into = str('B', 'base') ?? r.default_branch;
		if (head === into) die(`You're on ${into}; make a branch first.`);
		if (!str('H', 'head')) {
			// Push the branch if the server doesn't have this commit yet.
			const local = sh(['git', 'rev-parse', 'HEAD'], { quiet: true }).out;
			const remoteSha = sh(['git', 'ls-remote', 'origin', `refs/heads/${head}`], { quiet: true }).out.split(/\s/)[0];
			if (local !== remoteSha) run(['git', 'push', '-u', 'origin', `HEAD:refs/heads/${head}`]);
		}
		let title = str('t', 'title');
		let body = str('b', 'body');
		if (flag('fill') || !title) {
			const log = sh(['git', 'log', '--format=%s%n%n%b%x00', `origin/${into}..${head}`], { quiet: true }).out.split('\0').map((s) => s.trim()).filter(Boolean);
			if (!title && log.length === 1) [title, body] = [log[0].split('\n')[0], body ?? log[0].split('\n').slice(2).join('\n')];
			else if (!title && log.length) [title, body] = [head.replace(/[-_]/g, ' '), body ?? log.map((l) => `- ${l.split('\n')[0]}`).reverse().join('\n')];
		}
		if (!title) title = prompt('Title:') ?? die('A title is needed.');
		const p = await call('POST', `${base}/pulls`, { head, base: into, title, body: body ?? '', draft: !!flag('draft'), reviewers: list('r', 'reviewer') });
		console.log(`#${p.number} ${p.html_url}`);
	} else if (sub === 'merge') {
		const n = num(rest[0] ?? (await currentPr(base)));
		const style = (['merge', 'rebase', 'squash', 'fast-forward-only', 'rebase-merge'] as const).find((s) => flag(s));
		const auto = !!flag('auto');
		const res = await call('POST', `${base}/pulls/${n}/merge`, {
			...(style ? { Do: style } : {}),
			delete_branch_after_merge: !!flag('d', 'delete-branch'),
			...(auto ? { merge_when_checks_succeed: true } : {}),
			...(str('t', 'title') ? { MergeTitleField: str('t', 'title') } : {}),
			...(str('b', 'body') ? { MergeMessageField: str('b', 'body') } : {})
		});
		const p = await get(`${base}/pulls/${n}`);
		console.log(p.merged ? `Merged #${n}.` : auto ? `#${n} will merge when its checks pass.` : (res?.message ?? `#${n} is ${p.state}.`));
	} else if (sub === 'close' || sub === 'reopen') {
		const n = num(rest[0] ?? (await currentPr(base)));
		await call('PATCH', `${base}/pulls/${n}`, { state: sub === 'close' ? 'closed' : 'open' });
		console.log(`${sub === 'close' ? 'Closed' : 'Reopened'} #${n}.`);
	} else if (sub === 'edit') {
		const n = num(rest[0] ?? (await currentPr(base)));
		await call('PATCH', `${base}/pulls/${n}`, { ...(str('t', 'title') ? { title: str('t', 'title') } : {}), ...(str('b', 'body') !== undefined ? { body: str('b', 'body') } : {}) });
		console.log(`Updated #${n}.`);
	} else if (sub === 'comment') {
		const n = num(rest[0] ?? (await currentPr(base)));
		await comment(`${base}/issues/${n}`);
	} else if (sub === 'review') {
		const n = num(rest[0] ?? (await currentPr(base)));
		const event = flag('approve') ? 'APPROVED' : flag('request-changes') ? 'REQUEST_CHANGES' : flag('comment') ? 'COMMENT' : die('Pass --approve, --request-changes or --comment.');
		await call('POST', `${base}/pulls/${n}/reviews`, { event, body: str('b', 'body') ?? '' });
		console.log(`Reviewed #${n}.`);
	} else die(HELP);
}

// The open PR whose head is the current branch.
async function currentPr(base: string) {
	const b = branch();
	if (!b) return undefined;
	const prs: Json[] = await get(`${base}/pulls?state=open&limit=50`);
	const p = prs.find((p) => p.head.ref === b);
	return p ? String(p.number) : die(`No open PR for ${b}; give a number.`);
}

async function comment(path: string) {
	const body = str('b', 'body') ?? (!process.stdin.isTTY ? (await Bun.stdin.text()).trim() : undefined) ?? die('Give the comment with -b, or pipe it in.');
	const cm = await call('POST', `${path}/comments`, { body });
	console.log(cm.html_url ?? 'Commented.');
}

async function issue() {
	const base = repoPath();
	if (sub === 'list' || !sub) {
		const q = new URLSearchParams({ state: str('s', 'state') ?? 'open', type: 'issues', limit: str('L', 'limit') ?? '30' });
		for (const l of list('l', 'label')) q.append('labels', l);
		const author = str('A', 'author');
		if (author) q.set('created_by', author);
		const is: Json[] = await get(`${base}/issues?${q}`);
		if (!is.length) return console.log('No issues.');
		table(is.map((i) => [`#${i.number}`, i.state === 'open' ? green('open') : dim('closed'), i.title + labels(i), dim(i.user.login), dim(ago(i.updated_at))]));
	} else if (sub === 'view') {
		const n = num(rest[0]);
		const i = await get(`${base}/issues/${n}`);
		console.log(`${bold(i.title)} ${dim(`#${n}`)}\n${i.state === 'open' ? green('open') : dim('closed')} · ${i.user.login} · ${ago(i.created_at)} · ${i.comments} comments${labels(i)}\n\n${i.body || dim('No description')}\n\n${dim(i.html_url)}`);
		if (flag('c', 'comments')) await comments(`${base}/issues/${n}`);
	} else if (sub === 'create') {
		const title = str('t', 'title') ?? prompt('Title:') ?? die('A title is needed.');
		const all: Json[] = list('l', 'label').length ? await get(`${base}/labels?limit=100`) : [];
		const ids = list('l', 'label').map((n) => all.find((l) => l.name === n)?.id ?? die(`No label named ${n}.`));
		const i = await call('POST', `${base}/issues`, { title, body: str('b', 'body') ?? '', labels: ids });
		console.log(`#${i.number} ${i.html_url}`);
	} else if (sub === 'close' || sub === 'reopen') {
		const n = num(rest[0]);
		await call('PATCH', `${base}/issues/${n}`, { state: sub === 'close' ? 'closed' : 'open' });
		console.log(`${sub === 'close' ? 'Closed' : 'Reopened'} #${n}.`);
	} else if (sub === 'comment') await comment(`${base}/issues/${num(rest[0])}`);
	else die(HELP);
}

async function runs() {
	const base = repoPath();
	const mark = (s: string) => (s === 'success' ? green('✓') : s === 'failure' ? red('✗') : s === 'cancelled' ? dim('⊘') : yellow('•'));
	if (sub === 'list' || !sub) {
		const res = await get(`${base}/actions/runs?limit=${str('L', 'limit') ?? '20'}`);
		const rs: Json[] = res.workflow_runs ?? res;
		if (!rs.length) return console.log('No runs.');
		table(rs.map((r) => [mark(r.status), String(r.id), r.display_title ?? r.title ?? '', dim(r.path ?? r.workflow_id ?? ''), dim(r.head_branch ?? ''), dim(r.event ?? ''), dim(ago(r.started ?? r.created ?? r.run_started_at ?? r.created_at))]));
	} else if (sub === 'view') {
		const r = await get(`${base}/actions/runs/${num(rest[0])}`);
		console.log(`${mark(r.status)} ${bold(r.display_title ?? r.title ?? `Run ${r.id}`)} ${dim(r.status)}\n${dim(r.html_url ?? '')}`);
		for (const j of r.jobs ?? []) console.log(`  ${mark(j.status)} ${j.name} ${dim(j.status)}`);
	} else if (sub === 'cancel' || sub === 'rerun') {
		await call('POST', `${base}/actions/runs/${num(rest[0])}/${sub}`);
		console.log(sub === 'cancel' ? 'Cancelled.' : 'Started again.');
	} else die(HELP);
}

async function api() {
	const path = sub ?? die('Usage: shed api <path> [-X method] [-f key=value …]');
	const fields = list('f', 'field');
	const input = str('input');
	const body = input ? JSON.parse(input === '-' ? await Bun.stdin.text() : readFileSync(input, 'utf8')) : fields.length ? Object.fromEntries(fields.map((f) => {
		const [k, ...v] = f.split('=');
		const s = v.join('=');
		return [k, s === 'true' ? true : s === 'false' ? false : /^-?\d+$/.test(s) ? Number(s) : s];
	})) : undefined;
	const method = (str('X', 'method') ?? (body ? 'POST' : 'GET')).toUpperCase();
	const p = path.replace(/^\/?(api\/v1)?\/?/, '/').replace('{owner}/{repo}', context().full ?? '{owner}/{repo}');
	const res = await call(method, p, body);
	if (res !== null) console.log(typeof res === 'string' ? res : JSON.stringify(res, null, 2));
}

async function browse() {
	const { base, full } = context();
	if (!full) die('No repo here.');
	const url = sub === 'pr' ? `${base}/${full}/pulls/${num(rest[0])}` : sub === 'issue' ? `${base}/${full}/issues/${num(rest[0])}` : `${base}/${full}`;
	console.log(url);
}

const commands: Record<string, () => Promise<void>> = { auth, repo, pr, issue, run: runs, api, browse };
if (!group || group === 'help' || flag('help', 'h')) console.log(HELP);
else if (commands[group]) await commands[group]();
else die(`Unknown command ${group}.\n\n${HELP}`);
