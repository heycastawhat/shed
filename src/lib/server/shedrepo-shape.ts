import { atLeast, type Level } from './access.js';
import { toUser, type UserRow } from './accounts.js';
import type { Repo } from './forgejo.js';
import type { RepoRow } from './repos.js';

// Where SSH clone URLs point, set once the server knows its host name; empty when SSH is off.
let sshBase = '';
export const setSshBase = (b: string) => (sshBase = b);
export const getSshBase = () => sshBase;

export function toRepo(row: RepoRow, owner: UserRow, level: Level, empty: boolean, origin: string): Repo {
	const full = `${row.owner}/${row.name}`;
	return {
		id: row.id,
		full_name: full,
		name: row.name,
		description: row.description,
		private: !!row.private,
		updated_at: row.updated_at,
		default_branch: row.default_branch,
		owner: toUser(owner),
		clone_url: `${origin}/${full}.git`,
		ssh_url: sshBase ? `${sshBase}/${full}.git` : '',
		html_url: `${origin}/${full}`,
		empty,
		open_pr_counter: 0,
		open_issues_count: 0,
		has_issues: true,
		permissions: { admin: level === 'admin', push: atLeast(level, 'write'), pull: atLeast(level, 'read') },
		default_merge_style: 'merge',
		default_delete_branch_after_merge: false,
		allow_merge_commits: true,
		allow_rebase: true,
		allow_rebase_explicit: true,
		allow_squash_merge: true,
		allow_fast_forward_only_merge: true,
		language: '',
		stars_count: 0,
		forks_count: 0,
		fork: false,
		has_wiki: false,
		has_actions: true,
		has_projects: false,
		has_releases: true,
		archived: !!row.archived,
		watchers_count: 0
	};
}

