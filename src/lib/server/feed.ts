import type { User } from '#lib/server/forgejo.js';
import { unsign } from '#lib/sign.js';

export type Feed = {
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
function squash(events: ReturnType<typeof event>[], limit: number) {
	const out: typeof events = [];
	for (const e of events) {
		const prev = out.at(-1);
		if (prev && prev.op === e.op && prev.repo === e.repo && prev.ref === e.ref && prev.number === e.number && prev.who === e.who && e.op === 'commit_repo') prev.commits.push(...e.commits);
		else out.push(e);
	}
	return out.slice(0, limit).map((e) => ({ ...e, more: Math.max(0, e.commits.length - 3), commits: e.commits.slice(0, 3) }));
}

export const feedEvents = (feed: Feed[], limit = 15) => squash(feed.map(event), limit);
export type FeedEvent = ReturnType<typeof feedEvents>[number];
