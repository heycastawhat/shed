import { search } from './changes.js';
import { api, apiPage, request, type Pull, type Repo, type User } from './forgejo.js';
import { read, type Approval } from './store.js';

export type Need = {
	key: string;
	kind: 'Agent' | 'Review' | 'Mention' | 'Activity';
	title: string;
	sub: string;
	href: string;
	at: string;
	// Which buttons the row offers; the page maps them to actions.
	can: ('approve' | 'deny' | 'read')[];
	ref: { repo?: string; number?: number; id?: string; thread?: number };
};

const ORDER = { Agent: 0, Review: 1, Mention: 2, Activity: 3 } as const;
const TOOLS: Record<string, string> = {
	comment_on_pull_request: 'comment on a PR',
	comment_on_line: 'comment on a line',
	reply_to_thread: 'reply in a thread',
	resolve_thread: 'resolve a thread',
	open_pull_request: 'open a PR'
};

function summarize(a: Approval) {
	const bits = [a.repo, a.args.number ? `#${a.args.number}` : '', a.args.title ? `“${a.args.title}”` : '', a.args.head ? `from ${a.args.head}` : ''].filter(Boolean);
	return a.reason ? `${bits.join(' ')} · ${a.reason}` : bits.join(' ');
}

type Note = { id: number; unread: boolean; updated_at: string; subject: { title: string; url: string; html_url: string; type: string }; repository: { full_name: string } };

export async function needsYou(token: string, me: User): Promise<Need[]> {
	const d = await read();
	const snoozed = d.snoozed[me.id] ?? {};
	const [review, mentioned, notes] = await Promise.all([
		search(token, 'review_requested'),
		search(token, 'mentioned'),
		apiPage<Note>(token, '/notifications?status-types=unread&limit=30').then((p) => p.items, () => [])
	]);
	const out: Need[] = d.approvals
		.filter((a) => a.userId === me.id && a.status === 'pending')
		.map((a) => ({ key: `ap:${a.id}`, kind: 'Agent', title: `${a.keyName} wants to ${TOOLS[a.tool] ?? a.tool.replaceAll('_', ' ')}`, sub: summarize(a), href: '/settings/agents', at: a.at, can: ['approve', 'deny'], ref: { id: a.id } }));

	const seen = new Set<string>();
	const pr = (kind: 'Review' | 'Mention', c: Awaited<ReturnType<typeof search>>[number]) => {
		const key = `pr:${c.repo}#${c.number}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ key, kind, title: c.title, sub: `${c.repo} #${c.number} · ${c.author}`, href: c.href, at: c.updated, can: kind === 'Review' ? ['approve'] : [], ref: { repo: c.repo, number: c.number } });
	};
	review.forEach((c) => pr('Review', c));
	mentioned.filter((c) => c.author !== me.login).forEach((c) => pr('Mention', c));

	for (const n of notes) {
		const [, repo, number] = n.subject.url.match(/repos\/([^/]+\/[^/]+)\/(?:issues|pulls)\/(\d+)/) ?? [];
		const key = repo ? `pr:${repo}#${number}` : `n:${n.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ key, kind: 'Activity', title: n.subject.title, sub: `${n.repository.full_name}${number ? ` #${number}` : ''} · new activity`, href: repo ? `/${repo}/pulls/${number}` : '/', at: n.updated_at, can: ['read'], ref: { id: String(n.id), repo, number: number ? +number : undefined } });
	}

	return out
		.filter((n) => !(snoozed[n.key] && Date.parse(snoozed[n.key]) > Date.now()))
		.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.at.localeCompare(a.at));
}

export type Push = { id: number; repo: string; branch: string; at: string; commits: number; title: string; body: string };

type Feed = { id: number; op_type: string; ref_name: string; created: string; repo: Repo };
type Compare = { total_commits: number; commits: { commit: { message: string } }[] };

const humanize = (branch: string) => {
	const s = branch.split('/').at(-1)!.replaceAll(/[-_]+/g, ' ').trim();
	return s ? s[0].toUpperCase() + s.slice(1) : branch;
};

// One commit: its subject is the title. Several: the branch name as the title and the subjects as a list.
function draft(c: Compare, branch: string) {
	const subjects = c.commits.map((x) => x.commit.message.split('\n')[0]);
	return c.total_commits === 1 ? { title: subjects[0], body: '' } : { title: humanize(branch), body: subjects.map((s) => `- ${s}`).join('\n') };
}

// The latest branch you pushed in the last day that has no open pull request, with a title and description drafted from its commits.
export async function recentPush(token: string, me: User): Promise<Push | null> {
	const dismissed = new Set((await read()).dismissed[me.id] ?? []);
	const feed = await apiPage<Feed>(token, `/users/${me.login}/activities/feeds?only-performed-by=true&limit=30`).then((p) => p.items, () => []);
	const seen = new Set<string>();
	for (const a of feed) {
		const branch = a.ref_name?.startsWith('refs/heads/') ? a.ref_name.slice(11) : '';
		const id = `${a.repo?.full_name}:${branch}`;
		if (a.op_type !== 'commit_repo' || !branch || seen.has(id)) continue;
		seen.add(id);
		if (Date.now() - Date.parse(a.created) > 24 * 3600_000) break;
		if (branch === a.repo.default_branch || dismissed.has(`push:${a.id}`)) continue;
		try {
			const [open, cmp] = await Promise.all([
				api<Pull[]>(token, `/repos/${a.repo.full_name}/pulls?state=open&limit=50`),
				api<Compare>(token, `/repos/${a.repo.full_name}/compare/${encodeURIComponent(a.repo.default_branch)}...${encodeURIComponent(branch)}`)
			]);
			if (open.some((p) => p.head.ref === branch) || !cmp.total_commits) continue;
			return { id: a.id, repo: a.repo.full_name, branch, at: a.created, commits: cmp.total_commits, ...draft(cmp, branch) };
		} catch {
			// The branch was deleted or the repo went away: nothing to offer.
		}
	}
	return null;
}

export async function openPush(token: string, repo: string, branch: string) {
	const r = await api<Repo>(token, `/repos/${repo}`);
	const c = await api<Compare>(token, `/repos/${repo}/compare/${encodeURIComponent(r.default_branch)}...${encodeURIComponent(branch)}`);
	const res = await request(token, `/repos/${repo}/pulls`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ head: branch, base: r.default_branch, ...draft(c, branch) })
	});
	return ((await res.json()) as Pull).number;
}
