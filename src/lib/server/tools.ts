import { error, isHttpError } from '@sveltejs/kit';
import { sign } from '../sign.js';
import { allows, logActivity } from './agents.js';
import { userToken } from './auth.js';
import { api, apiPage, encodePath, isResolved, request, setResolved, type Comment, type Pull, type Repo, type Review, type ReviewComment } from './forgejo.js';
import { RULES_PATH, changedFiles, loadRules, touching } from './rules.js';
import { read, update, type AgentKey, type Approval } from './store.js';

export type Ctx = { key: AgentKey; token: string };
type Args = Approval['args'];
type Tool = { description: string; params: Record<string, [string, string, boolean?]>; write?: boolean; optIn?: boolean; run: (c: Ctx, a: Args) => Promise<unknown> };

const post = (token: string, path: string, body: unknown) =>
	request(token, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const signed = (c: Ctx, body: unknown) => sign(body, c.key.name, c.key.login);
const pr = (a: Args) => `/repos/${a.repo}/pulls/${a.number}`;

async function reviewComments(token: string, a: Args) {
	const reviews = await api<Review[]>(token, `${pr(a)}/reviews`);
	return (await Promise.all(reviews.map((r) => api<ReviewComment[]>(token, `${pr(a)}/reviews/${r.id}/comments`)))).flat();
}

const REPO: [string, string, boolean] = ['string', 'Repository as owner/name', true];
const NUMBER: [string, string, boolean] = ['number', 'Pull request number', true];

export const tools: Record<string, Tool> = {
	list_repositories: {
		description: 'List the repositories this key can use.',
		params: {},
		run: async ({ token, key }) =>
			(await apiPage<Repo>(token, '/user/repos?limit=50')).items
				.filter((r) => allows(key, r.full_name))
				.map((r) => ({ repo: r.full_name, description: r.description, default_branch: r.default_branch, private: r.private }))
	},
	list_pull_requests: {
		description: 'List pull requests in a repository.',
		params: { repo: REPO, state: ['string', 'open (default), closed or all'] },
		run: async ({ token }, a) =>
			(await apiPage<Pull>(token, `/repos/${a.repo}/pulls?state=${a.state ?? 'open'}&limit=50`)).items.map((p) => ({
				number: p.number,
				title: p.title,
				author: p.user.login,
				branch: p.head.label,
				base: p.base.ref,
				state: p.merged ? 'merged' : p.state
			}))
	},
	read_pull_request: {
		description: 'Read a pull request: description, branches, conversation comments and review threads (resolved or open).',
		params: { repo: REPO, number: NUMBER },
		run: async ({ token }, a) => {
			const [p, comments, inline] = await Promise.all([
				api<Pull>(token, pr(a)),
				api<Comment[]>(token, `/repos/${a.repo}/issues/${a.number}/comments`),
				reviewComments(token, a)
			]);
			const threads = new Map<string, ReviewComment[]>();
			for (const c of inline.sort((x, y) => x.id - y.id)) {
				const k = `${c.path}:${c.position || `old ${c.original_position}`}`;
				threads.set(k, [...(threads.get(k) ?? []), c]);
			}
			return {
				number: p.number,
				title: p.title,
				body: p.body,
				author: p.user.login,
				branch: p.head.ref,
				base: p.base.ref,
				state: p.merged ? 'merged' : p.state,
				mergeable: p.mergeable,
				comments: comments.map((c) => ({ author: c.user.login, body: c.body })),
				threads: await Promise.all(
					[...threads].map(async ([where, list]) => ({
						thread_id: list[0].id,
						where,
						resolved: !!list[0].resolver || (await isResolved(token, String(a.repo), list[0].id)),
						code: list[0].diff_hunk.split('\n').slice(-4).join('\n'),
						comments: list.map((c) => ({ author: c.user.login, body: c.body }))
					}))
				)
			};
		}
	},
	get_pull_request_diff: {
		description: 'Get the unified diff of a pull request.',
		params: { repo: REPO, number: NUMBER },
		run: async ({ token }, a) => (await (await request(token, `${pr(a)}.diff`)).text()).slice(0, 200_000)
	},
	read_file: {
		description: "Read a file from a repository at a branch, tag or commit (default: the repo's default branch). Use it for AGENTS.md.",
		params: { repo: REPO, path: ['string', 'File path', true], ref: ['string', 'Branch, tag or commit'] },
		run: async ({ token }, a) =>
			(await request(token, `/repos/${a.repo}/raw/${encodePath(String(a.path))}${a.ref ? `?ref=${encodeURIComponent(String(a.ref))}` : ''}`)).text()
	},
	comment_on_pull_request: {
		description: 'Post a comment on the pull request conversation.',
		params: { repo: REPO, number: NUMBER, body: ['string', 'Markdown', true] },
		write: true,
		run: async (c, a) => (await post(c.token, `/repos/${a.repo}/issues/${a.number}/comments`, { body: signed(c, a.body) })).html_url
	},
	comment_on_line: {
		description: 'Start a review thread on one line of a pull request diff. Line numbers are those of the new file, or of the old file with side "old" for removed lines. It can only comment: approving is up to the owner.',
		params: {
			repo: REPO,
			number: NUMBER,
			path: ['string', 'File path as shown in the diff', true],
			line: ['number', 'Line number', true],
			side: ['string', 'new (default) or old'],
			body: ['string', 'Markdown', true]
		},
		write: true,
		run: async (c, a) => {
			const line = Number(a.line);
			if (!Number.isInteger(line) || line < 1) error(400, 'line must be a positive integer');
			const files = (await apiPage<{ filename: string }>(c.token, `${pr(a)}/files?limit=200`)).items.map((f) => f.filename);
			if (!files.includes(String(a.path))) error(400, `${a.path} isn't changed in this pull request. Changed files: ${files.slice(0, 20).join(', ')}`);
			const where = a.side === 'old' ? { old_position: line } : { new_position: line };
			await post(c.token, `${pr(a)}/reviews`, { event: 'COMMENT', body: '', comments: [{ path: a.path, body: signed(c, a.body), ...where }] });
			return `Commented on ${a.path}:${line}`;
		}
	},
	reply_to_thread: {
		description: 'Reply in a review thread (thread_id from read_pull_request).',
		params: { repo: REPO, number: NUMBER, thread_id: ['number', 'Thread id', true], body: ['string', 'Markdown', true] },
		write: true,
		run: async (c, a) => {
			const root = (await reviewComments(c.token, a)).find((x) => x.id === Number(a.thread_id));
			if (!root) error(404, 'No such thread');
			const line = root.position ? { new_position: root.position } : { old_position: root.original_position };
			await post(c.token, `${pr(a)}/reviews`, { event: 'COMMENT', body: '', comments: [{ path: root.path, body: signed(c, a.body), ...line }] });
			return 'Replied';
		}
	},
	resolve_thread: {
		description: 'Mark a review thread resolved after addressing it.',
		params: { repo: REPO, number: NUMBER, thread_id: ['number', 'Thread id', true] },
		write: true,
		run: async (c, a) => {
			const form = new FormData();
			form.set('comment', String(a.thread_id));
			await setResolved(c.token, String(a.repo), form);
			return 'Resolved';
		}
	},
	open_pull_request: {
		description: 'Open a pull request from a branch you have already pushed.',
		params: {
			repo: REPO,
			head: ['string', 'Branch with the changes', true],
			base: ['string', 'Target branch (default: the default branch)'],
			title: ['string', 'Title', true],
			body: ['string', 'Markdown description']
		},
		write: true,
		run: async (c, a) => {
			const base = a.base ?? (await api<{ default_branch: string }>(c.token, `/repos/${a.repo}`)).default_branch;
			const p = await post(c.token, `/repos/${a.repo}/pulls`, { head: a.head, base, title: a.title, body: signed(c, a.body ?? '') });
			return { number: p.number, url: p.html_url };
		}
	},
	merge_pull_request: {
		description: 'Merge a pull request, or set it to merge once its checks pass. Only works if the owner turned merging on for this key.',
		params: {
			repo: REPO,
			number: NUMBER,
			style: ['string', "merge, squash, rebase, rebase-merge or fast-forward-only (default: the repo's default)"],
			delete_branch: ['boolean', 'Delete the head branch afterwards'],
			when_checks_pass: ['boolean', 'Schedule the merge for when checks pass instead of merging now']
		},
		write: true,
		optIn: true,
		run: async (c, a) => {
			const style = a.style ?? (await api<Repo>(c.token, `/repos/${a.repo}`)).default_merge_style;
			const body = { Do: style, delete_branch_after_merge: !!a.delete_branch, merge_when_checks_succeed: !!a.when_checks_pass };
			await request(c.token, `${pr(a)}/merge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			return a.when_checks_pass ? 'Scheduled to merge when checks pass' : 'Merged';
		}
	},
	get_rules: {
		description: `Read the limits this repo sets for agents (${RULES_PATH}): required branch prefix, paths that need the owner's approval, tools that always ask or are disabled. Check before opening a PR.`,
		params: { repo: REPO },
		run: async ({ token }, a) => {
			const rules = await loadRules(token, String(a.repo));
			return Object.keys(rules).length ? rules : { note: `No rules file (${RULES_PATH}) in this repo` };
		}
	},
	check_request: {
		description: "Check a request that was queued for the owner's approval (the id comes from the tool that queued it). Don't retry the original call.",
		params: { id: ['string', 'Request id', true] },
		run: async ({ key }, a) => {
			const r = (await read()).approvals.find((x) => x.id === a.id && x.keyId === key.id);
			if (!r) error(404, 'No such request');
			return { status: r.status, tool: r.tool, result: r.result };
		}
	}
};

export const WRITE_TOOLS = Object.entries(tools).filter(([, t]) => t.write).map(([name]) => name);
export const OPT_IN_TOOLS = Object.entries(tools).filter(([, t]) => t.optIn).map(([name]) => name);
export const usable = (key: AgentKey, name: string) => !tools[name]?.optIn || !!key.allow?.includes(name);

export const schema = (t: Tool) => ({
	type: 'object',
	properties: Object.fromEntries(Object.entries(t.params).map(([k, [type, description]]) => [k, { type, description }])),
	required: Object.entries(t.params).filter(([, p]) => p[2]).map(([k]) => k)
});

const text = (out: unknown) => (typeof out === 'string' ? out : JSON.stringify(out, null, 1));
const message = (e: unknown) => (isHttpError(e) ? `${e.status}: ${e.body.message}` : String(e));
const label = (name: string, a: Args) => `${name}${a.number ? ` #${a.number}` : ''}`;

async function execute(ctx: Ctx, name: string, args: Args) {
	if (!usable(ctx.key, name)) error(403, `This key isn't allowed to ${name.replaceAll('_', ' ')}. ${ctx.key.login} can turn it on in forge under Settings → Agents.`);
	const out = await tools[name].run(ctx, args);
	if (tools[name].write) await logActivity(ctx.key, String(args.repo), label(name, args));
	return text(out);
}

// What a repo's rules (plus the key's own ask list) say about one write: refuse it, park it for a human, or let it through.
async function gate(ctx: Ctx, name: string, args: Args) {
	const repo = String(args.repo);
	const rules = await loadRules(ctx.token, repo);
	if (rules.deny?.includes(name)) error(403, `${name} is disabled for ${repo} by ${RULES_PATH}`);
	let reason: string | undefined;
	if (name === 'open_pull_request') {
		if (rules.branchPrefix && !String(args.head).startsWith(rules.branchPrefix))
			error(403, `${repo} only accepts agent branches starting with "${rules.branchPrefix}" (${RULES_PATH}). Push to such a branch and try again.`);
		if (rules.protectedPaths?.length) {
			const files = await changedFiles(ctx.token, repo, args.base ? String(args.base) : undefined, String(args.head));
			const hits = files ? touching(files, rules.protectedPaths) : undefined;
			if (!files) reason = 'This repo protects some paths and forge could not list the changed files';
			else if (hits!.length) reason = `Touches protected paths: ${hits!.slice(0, 5).join(', ')}${hits!.length > 5 ? ` and ${hits!.length - 5} more` : ''}`;
		}
	}
	if (!reason && rules.ask?.includes(name)) reason = `${repo} always asks before ${name.replaceAll('_', ' ')}`;
	return { ask: !!reason || !!ctx.key.ask?.includes(name), reason };
}

const result = (isError: boolean, t: string) => ({ ...(isError && { isError }), content: [{ type: 'text', text: t }] });

export async function call(ctx: Ctx, name: string, args: Args) {
	const tool = tools[name];
	if (!tool) return result(true, `Unknown tool ${name}`);
	if (!usable(ctx.key, name)) return result(true, `This key isn't allowed to ${name.replaceAll('_', ' ')}. ${ctx.key.login} can turn it on in forge under Settings → Agents.`);
	const missing = Object.entries(tool.params).filter(([k, p]) => p[2] && (args[k] === undefined || args[k] === '')).map(([k]) => k);
	if (missing.length) return result(true, `Missing required argument${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
	if (tool.params.repo && !/^[\w.-]+\/[\w.-]+$/.test(String(args.repo))) return result(true, 'repo must be owner/name');
	const bad = Object.entries(tool.params).find(([k, [type]]) => type === 'number' && args[k] !== undefined && !/^\d+$/.test(String(args[k])));
	if (bad) return result(true, `${bad[0]} must be a whole number`);
	if (tool.params.repo && !allows(ctx.key, String(args.repo))) return result(true, `This key can't access ${args.repo}`);
	try {
		const verdict = tool.write ? await gate(ctx, name, args) : undefined;
		if (verdict?.ask) {
			const id = crypto.randomUUID().slice(0, 8);
			const { reason } = verdict;
			await update((d) =>
				d.approvals.push({ id, keyId: ctx.key.id, keyName: ctx.key.name, userId: ctx.key.userId, repo: String(args.repo), tool: name, args, status: 'pending', reason, at: new Date().toISOString() })
			);
			return result(false, `Queued for ${ctx.key.login}'s approval as request ${id}${reason ? ` (${reason})` : ''}. Nothing has happened yet. Tell the user, and use check_request with this id later. Don't retry.`);
		}
		return result(false, await execute(ctx, name, args));
	} catch (e) {
		return result(true, message(e));
	}
}

// Runs (or refuses) a queued call. Only the key's owner may decide, and only once.
export async function decide(userId: number, id: string, approve: boolean) {
	const d = await read();
	const a = d.approvals.find((x) => x.id === id && x.userId === userId);
	if (!a || a.status !== 'pending') error(409, 'That request is no longer pending');
	a.status = approve ? 'approved' : 'denied'; // claim it before awaiting so a double click can't run it twice
	a.decidedAt = new Date().toISOString();
	let output: string | undefined;
	if (approve) {
		try {
			const key = d.keys.find((k) => k.id === a.keyId);
			if (!key) error(410, 'The key was revoked');
			output = await execute({ key, token: await userToken(userId) }, a.tool, a.args);
		} catch (e) {
			a.status = 'failed';
			output = message(e);
		}
	}
	await update((s) => Object.assign(s.approvals.find((x) => x.id === id) ?? {}, { status: a.status, result: output, decidedAt: a.decidedAt }));
}
