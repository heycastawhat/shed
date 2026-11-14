import { error } from '@sveltejs/kit';
import { FORGEJO_URL } from '$app/env/private';

export async function request(token: string | undefined, path: string, init: RequestInit = {}) {
	// Paths are built from URL params and agent arguments; fetch would resolve a `..` segment and escape the repo (and an agent key's repo scope).
	if (path.split('?')[0].split(/[/\\]/).some((s) => /^(\.|%2e){1,2}$/i.test(s))) error(400, 'Invalid path');
	const res = await fetch(`${FORGEJO_URL}/api/v1${path}`, {
		...init,
		headers: { ...(token && { authorization: `Bearer ${token}` }), ...init.headers }
	}).catch(() => error(502, "Couldn't reach Forgejo"));
	if (!res.ok) error(res.status, (await res.json().catch(() => null))?.message || `Forgejo returned ${res.status} ${res.statusText}`);
	return res;
}

// Agent tasks push with the T3 host's git credentials, not the user's, so forge checks write access itself before starting one.
export async function requirePush(token: string | undefined, repo: string) {
	const r = await api<{ permissions?: { push: boolean } }>(token, `/repos/${repo}`);
	if (!r.permissions?.push) error(403, `You need write access to ${repo} to start an agent on it`);
}

export async function api<T>(token: string | undefined, path: string): Promise<T> {
	return (await request(token, path)).json();
}

export async function apiPage<T>(token: string | undefined, path: string) {
	const res = await request(token, path);
	return { items: (await res.json()) as T[], total: Number(res.headers.get('x-total-count') ?? 0) };
}

// For a file in the repo, pass `at` (its ref and folder) so relative links and images resolve to forge's own pages.
export async function renderMarkdown(token: string | undefined, text: string, repo: string, at?: { ref: string; dir: string }) {
	// Forgejo resolves relative paths against the context, so a context of <repo>/src/branch/<ref>/<dir> brings every file link back under one prefix to rewrite.
	const base = at && `${FORGEJO_URL}/${repo}/src/branch/${encodeURIComponent(at.ref)}/`;
	const res = await request(token, '/markdown', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ Text: text, Mode: 'gfm', Context: base ? base + encodePath(at!.dir) : `${FORGEJO_URL}/${repo}` })
	});
	const html = await res.text();
	if (!base) return html;
	const ref = encodeURIComponent(at!.ref);
	return html.replaceAll(`src="${base}`, `src="/${repo}/raw/${ref}/`).replaceAll(`href="${base}`, `href="/${repo}/blob/${ref}/`);
}

// Forgejo's API can't resolve conversations, so a reaction on the thread's first comment stands in for it.
const RESOLVED = 'rocket';

export async function isResolved(token: string | undefined, repo: string, comment: number) {
	const reactions = await api<{ content: string }[] | null>(token, `/repos/${repo}/issues/comments/${comment}/reactions`);
	return !!reactions?.some((r) => r.content === RESOLVED);
}

export async function setResolved(token: string | undefined, repo: string, form: FormData) {
	await request(token, `/repos/${repo}/issues/comments/${form.get('comment')}/reactions`, {
		method: form.has('undo') ? 'DELETE' : 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ content: RESOLVED })
	});
}

export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export type User = { id: number; login: string; full_name: string; avatar_url: string };
export type Repo = {
	id: number;
	full_name: string;
	name: string;
	description: string;
	private: boolean;
	updated_at: string;
	default_branch: string;
	owner: User;
	clone_url: string;
	ssh_url: string;
	html_url: string;
	empty: boolean;
	open_pr_counter: number;
	open_issues_count: number;
	has_issues: boolean;
	permissions: { admin: boolean; push: boolean; pull: boolean };
	default_merge_style: MergeStyle;
	default_delete_branch_after_merge: boolean;
	allow_merge_commits: boolean;
	allow_rebase: boolean;
	allow_rebase_explicit: boolean;
	allow_squash_merge: boolean;
	allow_fast_forward_only_merge: boolean;
	language: string;
	stars_count: number;
	forks_count: number;
	fork: boolean;
	has_wiki: boolean;
	has_actions: boolean;
	has_projects: boolean;
	has_releases: boolean;
	archived: boolean;
	watchers_count: number;
};
export type MergeStyle = 'merge' | 'rebase' | 'rebase-merge' | 'squash' | 'fast-forward-only';
export type Branch = { name: string };
export type Entry = {
	name: string;
	path: string;
	sha?: string;
	type: 'file' | 'dir' | 'symlink' | 'submodule';
	size: number;
	last_commit_sha?: string;
	content?: string | null;
};
export type Commit = {
	sha: string;
	commit: { message: string; author: { name: string; date: string } };
	author: User | null;
};
export type CommitDetail = Commit & { parents: { sha: string }[] };
export type Pull = {
	number: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	merged: boolean;
	mergeable: boolean;
	merged_by: User | null;
	merged_at: string | null;
	closed_at: string | null;
	draft: boolean;
	user: User;
	labels: Label[];
	assignees: User[] | null;
	milestone: Milestone | null;
	head: { ref: string; label: string; sha: string };
	base: { ref: string };
	created_at: string;
	comments: number;
	changed_files?: number;
	additions?: number;
	deletions?: number;
};
// A pull request as returned by /repos/issues/search, which uses the issue shape.
export type FoundPull = {
	number: number;
	title: string;
	state: 'open' | 'closed';
	user: User;
	body: string;
	repository: { full_name: string };
	created_at: string;
	updated_at: string;
	comments: number;
	labels: Label[];
	pull_request?: { merged: boolean; draft: boolean };
};
export type Label = { id: number; name: string; color: string; description: string };
export type Milestone = { id: number; title: string; description: string; state: 'open' | 'closed'; open_issues: number; closed_issues: number; due_on: string | null };
export type Issue = {
	number: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	user: User;
	labels: Label[];
	assignees: User[] | null;
	milestone: Milestone | null;
	comments: number;
	created_at: string;
	closed_at: string | null;
	pull_request: unknown;
};
export type Comment = { id: number; body: string; user: User; created_at: string };
export type ReviewComment = Comment & { path: string; position: number; original_position: number; diff_hunk: string; resolver: User | null; pull_request_review_id: number };
export type Review = { id: number; body: string; user: User; state: string; submitted_at: string; stale: boolean; dismissed: boolean };
export type CombinedStatus = { state: string; total_count: number; statuses: { status: string; context: string; description: string; target_url: string }[] | null };
