import { api, type Repo, type User } from '#lib/server/forgejo.js';
import { unsign } from '#lib/sign.js';

type Owner = User & { description: string; website: string; location: string; created: string; followers_count: number; following_count: number; starred_repos_count: number };
type Org = User & { name: string; description: string; website: string; location: string };
type Feed = {
	id: number;
	op_type: string;
	act_user: User;
	repo: { full_name: string };
	ref_name: string;
	content: string;
	comment?: { body: string } | null;
	created: string;
};

// Forgejo's issue/PR events carry "N|title" (older) or a JSON ["N","title"] (newer) in `content`; pushes carry JSON commits.
function event(a: Feed) {
	let number: string | undefined, title: string | undefined, commits: { Sha1: string; Message: string }[] | undefined;
	try {
		const c = JSON.parse(a.content);
		if (Array.isArray(c)) [number, title] = c;
		else commits = c?.Commits;
	} catch {
		[number, title] = a.content.split('|');
	}
	// `content` is cut short, so the signature at the end of a comment is only in the full `comment` body.
	const comment = a.op_type.startsWith('comment') && title !== undefined ? unsign(a.comment?.body ?? title) : undefined;
	return {
		id: a.id,
		// A push with no commits is a new branch.
		op: a.op_type === 'commit_repo' && !commits?.length ? 'create_branch' : a.op_type,
		who: a.act_user.login,
		agent: comment?.agent,
		repo: a.repo.full_name,
		ref: a.ref_name.replace(/^refs\/(heads|tags)\//, ''),
		number: number ? Number(number) : undefined,
		// The first line of a comment as plain text: links keep their text, markup goes.
		title: comment ? plain(comment.body) : title,
		commits: commits?.map((c) => ({ sha: c.Sha1, message: c.Message.split('\n')[0] })) ?? [],
		created: a.created
	};
}

const plain = (md: string) =>
	md
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>|[`*_~#>]/g, '')
		.split('\n')
		.find((l) => l.trim())
		?.trim() ?? '';

// Forgejo logs each push and comment separately; runs of the same event on the same target read better as one line.
function squash(events: ReturnType<typeof event>[]) {
	const out: typeof events = [];
	for (const e of events) {
		const prev = out.at(-1);
		if (prev && prev.op === e.op && prev.repo === e.repo && prev.ref === e.ref && prev.number === e.number && prev.who === e.who && e.op === 'commit_repo') prev.commits.push(...e.commits);
		else out.push(e);
	}
	return out.slice(0, 15).map((e) => ({ ...e, more: Math.max(0, e.commits.length - 3), commits: e.commits.slice(0, 3) }));
}

// Contributions per day for the last 53 weeks, ending today, starting on a Sunday so the grid's rows are weekdays.
function calendar(heat: { timestamp: number; contributions: number }[]) {
	const day = (d: Date) => d.toLocaleDateString('en-CA');
	const counts = new Map<string, number>();
	for (const h of heat) counts.set(day(new Date(h.timestamp * 1000)), (counts.get(day(new Date(h.timestamp * 1000))) ?? 0) + h.contributions);
	const start = new Date();
	start.setDate(start.getDate() - 52 * 7 - start.getDay());
	const days = [];
	for (const d = start; d <= new Date(); d.setDate(d.getDate() + 1)) days.push({ date: day(d), count: counts.get(day(d)) ?? 0 });
	return days;
}

export async function load({ locals, params }) {
	const [owner, repos, members] = await Promise.all([
		api<Owner>(locals.token, `/users/${params.owner}`),
		api<Repo[]>(locals.token, `/users/${params.owner}/repos?limit=50`),
		// Only orgs have members; a user 404s here.
		api<User[]>(locals.token, `/orgs/${params.owner}/members?limit=50`).catch(() => null)
	]);
	const org = !!members;
	const [orgs, heat, feed] = await Promise.all([
		org ? [] : api<Org[]>(locals.token, `/users/${params.owner}/orgs`).catch(() => []),
		org ? [] : api<{ timestamp: number; contributions: number }[]>(locals.token, `/users/${params.owner}/heatmap`).catch(() => []),
		api<Feed[]>(locals.token, org ? `/orgs/${params.owner}/activities/feeds?limit=40` : `/users/${params.owner}/activities/feeds?only-performed-by=true&limit=40`).catch(() => [])
	]);
	repos.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	return { owner, repos, members, orgs, days: org ? null : calendar(heat), feed: squash(feed.map(event)) };
}
