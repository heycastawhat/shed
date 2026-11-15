import { fail } from '@sveltejs/kit';
import { unsign } from '#lib/sign.js';
import { send } from './issue.js';
import { api, renderMarkdown, type Label, type Milestone, type User } from './forgejo.js';

// The conversation shared by issues and PRs: comments with reactions, and the timeline's events, in one shape the pages render.

type Where = { locals: { token?: string }; params: { owner: string; repo: string; index: string }; request: Request };
export type ApiReaction = { content: string; user: User | null };
export type Reaction = { content: string; users: string[]; mine: boolean };

export function groupReactions(list: ApiReaction[] | null, me?: string): Reaction[] {
	const by = new Map<string, Reaction>();
	for (const r of list ?? []) {
		const g = by.get(r.content) ?? { content: r.content, users: [], mine: false };
		g.users.push(r.user?.login ?? 'someone');
		g.mine ||= r.user?.login === me;
		by.set(r.content, g);
	}
	return [...by.values()];
}

type ApiEvent = {
	id: number;
	type: string;
	user: User;
	body: string;
	created_at: string;
	updated_at?: string;
	label?: Label | null;
	old_title?: string;
	new_title?: string;
	assignee?: User | null;
	removed_assignee?: boolean;
	milestone?: Milestone | null;
	old_milestone?: Milestone | null;
	ref_repo?: string;
	ref_number?: number;
	ref_title?: string;
	ref_is_pull?: boolean;
	is_force_push?: boolean;
	commit_ids?: string[];
	before?: string;
	after?: string;
	old_ref?: string;
	new_ref?: string;
	commit_id?: string;
	ref?: string;
	style?: string;
	message?: string;
};

export type ThreadItem = {
	id: number;
	type: string;
	user: User;
	date: string;
	// Comments
	html?: string;
	body?: string;
	agent?: string;
	edited?: boolean;
	reactions?: Reaction[];
	// Events
	label?: Label;
	added?: boolean;
	title?: { from?: string; to?: string };
	who?: string;
	removed?: boolean;
	milestone?: { from?: string; to?: string };
	link?: { href: string; text: string; title: string };
	push?: { forced: boolean; commits: string[]; before?: string; after?: string };
	refs?: { from?: string; to?: string };
	commit?: string;
	text?: string;
};

// Event kinds the pages know how to draw; anything else in the timeline is skipped.
const KINDS = new Set([
	'comment', 'close', 'reopen', 'label', 'change_title', 'assignees', 'milestone', 'issue_ref', 'pull_ref', 'lock', 'unlock', 'review_request', 'draft', 'ready_for_review',
	'change_target_branch', 'pull_push', 'merge_pull', 'delete_branch', 'pull_scheduled_merge', 'pull_cancel_scheduled_merge', 'dismiss_review'
]);

export function shapeEvent(e: ApiEvent): ThreadItem | null {
	if (!KINDS.has(e.type) || (e.type === 'label' && !e.label) || ((e.type === 'assignees' || e.type === 'review_request') && !e.assignee)) return null;
	const base: ThreadItem = { id: e.id, type: e.type, user: e.user, date: e.created_at };
	switch (e.type) {
		case 'label':
			return { ...base, label: e.label!, added: e.body === '1' };
		case 'change_title':
			return { ...base, title: { from: e.old_title, to: e.new_title } };
		case 'assignees':
		case 'review_request':
			return { ...base, who: e.assignee!.login, removed: !!e.removed_assignee };
		case 'milestone':
			return { ...base, milestone: { from: e.old_milestone?.title, to: e.milestone?.title } };
		case 'issue_ref':
		case 'pull_ref':
			return { ...base, link: { href: `/${e.ref_repo}/${e.ref_is_pull ? 'pulls' : 'issues'}/${e.ref_number}`, text: `${e.ref_repo}#${e.ref_number}`, title: e.ref_title ?? '' } };
		case 'pull_push':
			return { ...base, push: { forced: !!e.is_force_push, commits: e.commit_ids ?? [], before: e.before, after: e.after } };
		case 'change_target_branch':
			return { ...base, refs: { from: e.old_ref, to: e.new_ref } };
		case 'merge_pull':
			return { ...base, commit: e.commit_id };
		case 'delete_branch':
			return { ...base, refs: { from: e.ref } };
		case 'dismiss_review':
			return { ...base, text: e.message };
	}
	return base;
}

export async function loadThread(token: string | undefined, repo: string, index: string | number, me?: string) {
	const path = `/repos/${repo}/issues/${index}`;
	const [events, reactions, sub] = await Promise.all([
		// An issue with no activity gets `null` rather than an empty list.
		api<ApiEvent[] | null>(token, `${path}/timeline`),
		api<ApiReaction[] | null>(token, `${path}/reactions`),
		me ? api<{ subscribed: boolean }>(token, `${path}/subscriptions/check`).then((s) => s.subscribed, () => false) : false
	]);
	const items = await Promise.all(
		(events ?? []).map(async (e) => {
			if (e.type !== 'comment') return shapeEvent(e);
			const { body, agent } = unsign(e.body);
			const [html, rs] = await Promise.all([body.trim() ? renderMarkdown(token, body, repo) : '', api<ApiReaction[] | null>(token, `/repos/${repo}/issues/comments/${e.id}/reactions`)]);
			return { ...shapeEvent(e)!, html, body, agent, edited: !!e.updated_at && e.updated_at.slice(0, 19) !== e.created_at.slice(0, 19), reactions: groupReactions(rs, me) };
		})
	);
	return { items: items.filter((x): x is ThreadItem => !!x), reactions: groupReactions(reactions, me), subscribed: sub };
}

const path = (p: Where['params']) => `/repos/${p.owner}/${p.repo}/issues/${p.index}`;
const commentPath = (p: Where['params'], id: unknown) => `/repos/${p.owner}/${p.repo}/issues/comments/${Number(id)}`;

export const threadActions = {
	// Close or reopen, posting the composer's text first if there is any.
	state: async ({ locals, params, request }: Where) => {
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		return (body && (await send('comment', locals.token, `${path(params)}/comments`, 'POST', { body }))) || send('comment', locals.token, path(params), 'PATCH', { state: form.get('to') });
	},
	editComment: async ({ locals, params, request }: Where) => {
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trimEnd();
		if (!body.trim()) return fail(400, { action: `comment-${form.get('id')}`, error: 'Comment is empty' });
		// Keep an agent's signature, which the editor doesn't show.
		const old = (await api<{ body: string }>(locals.token, commentPath(params, form.get('id')))).body;
		return send(`comment-${form.get('id')}`, locals.token, commentPath(params, form.get('id')), 'PATCH', { body: body + old.slice(unsign(old).body.length) });
	},
	deleteComment: async ({ locals, params, request }: Where) => {
		const id = (await request.formData()).get('id');
		return send(`comment-${id}`, locals.token, commentPath(params, id), 'DELETE');
	},
	// No `id` reacts to the issue or PR itself.
	react: async ({ locals, params, request }: Where) => {
		const form = await request.formData();
		const id = form.get('id');
		return send('react', locals.token, id ? `${commentPath(params, id)}/reactions` : `${path(params)}/reactions`, form.has('remove') ? 'DELETE' : 'POST', { content: form.get('content') });
	},
	lock: async ({ locals, params, request }: Where) => send('lock', locals.token, `${path(params)}/lock`, (await request.formData()).has('undo') ? 'DELETE' : 'PUT'),
	pin: async ({ locals, params, request }: Where) => send('pin', locals.token, `${path(params)}/pin`, (await request.formData()).has('undo') ? 'DELETE' : 'POST'),
	subscribe: async ({ locals, params, request }: Where) => {
		const { login } = await api<User>(locals.token, '/user');
		return send('subscribe', locals.token, `${path(params)}/subscriptions/${encodeURIComponent(login)}`, (await request.formData()).has('undo') ? 'DELETE' : 'PUT');
	}
};
