import { error, fail, isHttpError } from '@sveltejs/kit';
import { request, type Repo, type User } from './forgejo.js';

export type RepoFull = Repo & {
	website: string;
	template: boolean;
	mirror: boolean;
	mirror_interval: string;
	mirror_updated: string;
	original_url: string;
	parent: Repo | null;
	has_pull_requests: boolean;
	has_packages: boolean;
	ignore_whitespace_conflicts: boolean;
	allow_rebase_update: boolean;
	default_allow_maintainer_edit: boolean;
	default_update_style: 'merge' | 'rebase';
	internal_tracker?: { enable_time_tracker: boolean; allow_only_contributors_to_track_time: boolean; enable_issue_dependencies: boolean };
	external_tracker?: { external_tracker_url: string; external_tracker_format: string; external_tracker_style: string; external_tracker_regexp_pattern: string };
	external_wiki?: { external_wiki_url: string };
	topics: string[] | null;
	repo_transfer: { recipient: User } | null;
	object_format_name: string;
};

export type Protection = {
	rule_name: string;
	branch_name: string;
	enable_push: boolean;
	enable_push_whitelist: boolean;
	push_whitelist_usernames: string[] | null;
	push_whitelist_deploy_keys: boolean;
	enable_merge_whitelist: boolean;
	merge_whitelist_usernames: string[] | null;
	enable_status_check: boolean;
	status_check_contexts: string[] | null;
	required_approvals: number;
	enable_approvals_whitelist: boolean;
	approvals_whitelist_username: string[] | null;
	block_on_rejected_reviews: boolean;
	block_on_official_review_requests: boolean;
	block_on_outdated_branch: boolean;
	dismiss_stale_approvals: boolean;
	ignore_stale_approvals: boolean;
	require_signed_commits: boolean;
	protected_file_patterns: string;
	unprotected_file_patterns: string;
	apply_to_admins: boolean;
	updated_at: string;
};

export type Hook = {
	id: number;
	type: string;
	active: boolean;
	events: string[];
	branch_filter: string;
	authorization_header: string;
	config: Record<string, string>;
	updated_at: string;
};

type Locals = { token?: string };

// Runs one Forgejo write for a form action: success returns `{ action, saved }`, an API error becomes `fail(status, { action, error })` for the page to show.
export async function call(action: string, token: string | undefined, path: string, method: string, body?: unknown) {
	try {
		const res = await request(token, path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
		return { action, saved: true as const, result: res.status === 204 ? null : await res.json().catch(() => null) };
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { action, error: e.body.message });
		throw e;
	}
}

export const repoPath = (p: { owner: string; repo: string }) => `/repos/${p.owner}/${p.repo}`;

export function needToken(locals: Locals) {
	if (!locals.token) error(401, 'Sign in first');
	return locals.token;
}

export async function formOf(req: Request) {
	const form = await req.formData();
	return {
		form,
		str: (k: string) => String(form.get(k) ?? '').trim(),
		bool: (k: string) => form.has(k),
		list: (k: string) =>
			String(form.get(k) ?? '')
				.split(/[\s,]+/)
				.filter(Boolean)
	};
}

export const EVENTS = [
	['create', 'Branch or tag created'],
	['delete', 'Branch or tag deleted'],
	['fork', 'Repository forked'],
	['push', 'Push'],
	['issues', 'Issue opened, edited or closed'],
	['issue_assign', 'Issue assigned'],
	['issue_label', 'Issue labels changed'],
	['issue_milestone', 'Issue milestone changed'],
	['issue_comment', 'Issue comment'],
	['pull_request', 'Pull request opened, edited or closed'],
	['pull_request_assign', 'Pull request assigned'],
	['pull_request_label', 'Pull request labels changed'],
	['pull_request_milestone', 'Pull request milestone changed'],
	['pull_request_comment', 'Pull request comment'],
	['pull_request_review_approved', 'Pull request approved'],
	['pull_request_review_rejected', 'Pull request changes requested'],
	['pull_request_review_comment', 'Pull request review comment'],
	['pull_request_sync', 'Pull request synchronised'],
	['pull_request_review_request', 'Review requested'],
	['wiki', 'Wiki'],
	['repository', 'Repository created or deleted'],
	['release', 'Release'],
	['package', 'Package'],
	['action_run_failure', 'Actions run failed'],
	['action_run_recover', 'Actions run recovered'],
	['action_run_success', 'Actions run succeeded']
] as const;

export const HOOK_TYPES = ['forgejo', 'gitea', 'gogs', 'slack', 'discord', 'msteams', 'telegram', 'dingtalk', 'feishu', 'wechatwork', 'packagist'] as const;
