import { Database } from 'bun:sqlite';

// Append only: never edit a shipped migration, add a new one. `user_version` records how many have run.
const MIGRATIONS = [
	`create table users (
		id integer primary key,
		login text not null unique collate nocase,
		kind text not null default 'user' check (kind in ('user', 'org', 'agent')),
		name text not null default '',
		email text unique collate nocase,
		oidc_sub text unique,
		-- An agent's owner, so its writes can be traced to a person.
		owner_id integer references users(id),
		admin integer not null default 0,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table repos (
		id integer primary key,
		owner_id integer not null references users(id),
		name text not null collate nocase,
		description text not null default '',
		private integer not null default 1,
		default_branch text not null default 'main',
		archived integer not null default 0,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (owner_id, name)
	);
	create table collaborators (
		repo_id integer not null references repos(id) on delete cascade,
		user_id integer not null references users(id) on delete cascade,
		permission text not null check (permission in ('read', 'write', 'admin')),
		primary key (repo_id, user_id)
	);
	create table tokens (
		id integer primary key,
		user_id integer not null references users(id) on delete cascade,
		name text not null,
		hash text not null unique,
		scopes text not null default '[]',
		repos text not null default '["*"]',
		expires_at text,
		last_used_at text,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table sessions (
		hash text primary key,
		user_id integer not null references users(id) on delete cascade,
		ua text not null default '',
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		last_seen_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);`,
	`alter table users add column avatar_url text not null default '';`,
	`create table org_members (
		org_id integer not null references users(id) on delete cascade,
		user_id integer not null references users(id) on delete cascade,
		role text not null default 'member' check (role in ('owner', 'member')),
		primary key (org_id, user_id)
	);
	alter table users add column description text not null default '';
	alter table users add column website text not null default '';
	alter table users add column location text not null default '';
	-- What people did, for profile and repo activity and the contribution heatmap. Shapes follow Forgejo's feed (op names, content).
	create table activity (
		id integer primary key,
		user_id integer not null references users(id) on delete cascade,
		repo_id integer references repos(id) on delete cascade,
		op text not null,
		ref text not null default '',
		content text not null default '',
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create index activity_user on activity (user_id, created_at);
	create index activity_repo on activity (repo_id, created_at);`,
	// Issues and pull requests share one numbering per repo, as in Forgejo, so imported links keep working.
	`alter table repos add column next_number integer not null default 1;
	alter table repos add column fork_of integer references repos(id) on delete set null;
	alter table repos add column has_issues integer not null default 1;
	alter table repos add column has_wiki integer not null default 1;
	alter table repos add column default_merge_style text not null default 'merge';
	alter table repos add column delete_branch_after_merge integer not null default 0;
	alter table repos add column merge_styles text not null default '["merge","rebase","rebase-merge","squash","fast-forward-only"]';
	create table milestones (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		title text not null collate nocase,
		description text not null default '',
		state text not null default 'open' check (state in ('open', 'closed')),
		due_on text,
		closed_at text,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (repo_id, title)
	);
	create table labels (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		name text not null collate nocase,
		color text not null default 'ededed',
		description text not null default '',
		unique (repo_id, name)
	);
	create table issues (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		number integer not null,
		user_id integer not null references users(id),
		title text not null,
		body text not null default '',
		state text not null default 'open' check (state in ('open', 'closed')),
		is_pull integer not null default 0,
		milestone_id integer references milestones(id) on delete set null,
		locked integer not null default 0,
		pinned integer not null default 0,
		due_on text,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		closed_at text,
		unique (repo_id, number)
	);
	create index issues_repo on issues (repo_id, is_pull, state, updated_at);
	create table issue_labels (
		issue_id integer not null references issues(id) on delete cascade,
		label_id integer not null references labels(id) on delete cascade,
		primary key (issue_id, label_id)
	);
	create table assignees (
		issue_id integer not null references issues(id) on delete cascade,
		user_id integer not null references users(id) on delete cascade,
		primary key (issue_id, user_id)
	);
	create table pulls (
		issue_id integer primary key references issues(id) on delete cascade,
		base text not null,
		head text not null,
		-- Set when the head branch lives in a fork.
		head_repo_id integer references repos(id) on delete set null,
		head_sha text not null,
		merge_base text,
		draft integer not null default 0,
		merged_at text,
		merged_by integer references users(id),
		merge_commit text,
		-- Merge when checks pass: the style to merge with, and who asked.
		auto_merge text,
		auto_merge_by integer references users(id),
		auto_merge_message text
	);
	create index pulls_head on pulls (head);
	-- Every push to a PR's head, so comments stay tied to what they were made on and "changes since your review" is a diff.
	create table revisions (
		id integer primary key,
		issue_id integer not null references issues(id) on delete cascade,
		head_sha text not null,
		before_sha text,
		base_sha text,
		user_id integer references users(id),
		forced integer not null default 0,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table reviews (
		id integer primary key,
		issue_id integer not null references issues(id) on delete cascade,
		user_id integer not null references users(id),
		state text not null check (state in ('APPROVED', 'REQUEST_CHANGES', 'COMMENT', 'PENDING', 'REQUEST_REVIEW')),
		body text not null default '',
		commit_sha text not null default '',
		dismissed integer not null default 0,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table review_requests (
		issue_id integer not null references issues(id) on delete cascade,
		user_id integer not null references users(id) on delete cascade,
		primary key (issue_id, user_id)
	);
	create table comments (
		id integer primary key,
		issue_id integer not null references issues(id) on delete cascade,
		user_id integer not null references users(id),
		body text not null default '',
		review_id integer references reviews(id) on delete cascade,
		-- Line comments: where, on which side and line of which commit's diff, and the hunk around it as it was.
		path text,
		side text check (side in ('old', 'new')),
		line integer,
		commit_sha text,
		diff_hunk text,
		resolved_by integer references users(id),
		resolved_at text,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create index comments_issue on comments (issue_id, created_at);
	create table reactions (
		id integer primary key,
		issue_id integer references issues(id) on delete cascade,
		comment_id integer references comments(id) on delete cascade,
		user_id integer not null references users(id) on delete cascade,
		content text not null,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (issue_id, comment_id, user_id, content)
	);
	-- Timeline entries other than comments and reviews: label, assignees, milestone, change_title, close, reopen, merge_pull, push, ...
	create table events (
		id integer primary key,
		issue_id integer not null references issues(id) on delete cascade,
		user_id integer not null references users(id),
		kind text not null,
		data text not null default '{}',
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create index events_issue on events (issue_id, created_at);
	create table statuses (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		sha text not null,
		context text not null default 'default',
		state text not null check (state in ('pending', 'success', 'error', 'failure', 'warning')),
		description text not null default '',
		target_url text not null default '',
		creator_id integer references users(id),
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create index statuses_sha on statuses (repo_id, sha, context, id);
	create table releases (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		tag text not null,
		target text not null default '',
		name text not null default '',
		body text not null default '',
		draft integer not null default 0,
		prerelease integer not null default 0,
		user_id integer not null references users(id),
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		published_at text,
		unique (repo_id, tag)
	);
	create table release_assets (
		id integer primary key,
		release_id integer not null references releases(id) on delete cascade,
		name text not null,
		size integer not null,
		uuid text not null unique,
		download_count integer not null default 0,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table notifications (
		id integer primary key,
		user_id integer not null references users(id) on delete cascade,
		issue_id integer references issues(id) on delete cascade,
		repo_id integer not null references repos(id) on delete cascade,
		reason text not null default '',
		unread integer not null default 1,
		pinned integer not null default 0,
		updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (user_id, issue_id)
	);
	create table subscriptions (
		user_id integer not null references users(id) on delete cascade,
		issue_id integer not null references issues(id) on delete cascade,
		subscribed integer not null default 1,
		primary key (user_id, issue_id)
	);
	create table stars (
		user_id integer not null references users(id) on delete cascade,
		repo_id integer not null references repos(id) on delete cascade,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		primary key (user_id, repo_id)
	);
	create table watches (
		user_id integer not null references users(id) on delete cascade,
		repo_id integer not null references repos(id) on delete cascade,
		primary key (user_id, repo_id)
	);
	create table protected_branches (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		pattern text not null,
		required_approvals integer not null default 0,
		required_checks text not null default '[]',
		block_on_rejected integer not null default 1,
		dismiss_stale integer not null default 0,
		push text not null default 'none' check (push in ('none', 'admins', 'all')),
		force_push integer not null default 0,
		unique (repo_id, pattern)
	);
	create table hooks (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		url text not null,
		secret text not null default '',
		events text not null default '["push"]',
		active integer not null default 1,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table hook_deliveries (
		id integer primary key,
		hook_id integer not null references hooks(id) on delete cascade,
		event text not null,
		status integer,
		response text not null default '',
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);`,
	// CI: forgejo-runner registers runners, takes tasks (one job each) and streams logs back.
	`create table runners (
		id integer primary key,
		uuid text not null unique,
		token_hash text not null,
		name text not null,
		labels text not null default '[]',
		version text not null default '',
		-- null: available to every repo (an admin's runner); else only this repo's jobs.
		repo_id integer references repos(id) on delete cascade,
		ephemeral integer not null default 0,
		last_online text,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table runner_tokens (
		id integer primary key,
		token text not null unique,
		repo_id integer references repos(id) on delete cascade,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table runs (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		number integer not null,
		workflow text not null,
		name text not null,
		title text not null,
		event text not null,
		event_payload text not null default '{}',
		ref text not null,
		sha text not null,
		user_id integer references users(id),
		issue_id integer references issues(id) on delete set null,
		status text not null default 'waiting',
		attempt integer not null default 1,
		started_at text,
		stopped_at text,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (repo_id, number)
	);
	create index runs_repo on runs (repo_id, id);
	create table jobs (
		id integer primary key,
		run_id integer not null references runs(id) on delete cascade,
		job_key text not null,
		name text not null,
		needs text not null default '[]',
		runs_on text not null default '[]',
		payload text not null,
		status text not null default 'blocked',
		result text,
		outputs text not null default '{}',
		uses_always integer not null default 0,
		attempt integer not null default 1,
		task_id integer,
		started_at text,
		stopped_at text
	);
	create index jobs_status on jobs (status);
	create table tasks (
		id integer primary key,
		job_id integer not null references jobs(id) on delete cascade,
		runner_id integer references runners(id) on delete set null,
		token_hash text not null unique,
		status text not null default 'running',
		steps text not null default '[]',
		log_length integer not null default 0,
		started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		stopped_at text,
		updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table action_secrets (
		repo_id integer not null references repos(id) on delete cascade,
		name text not null,
		value text not null,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		primary key (repo_id, name)
	);
	create table action_vars (
		repo_id integer not null references repos(id) on delete cascade,
		name text not null,
		value text not null,
		primary key (repo_id, name)
	);
	alter table repos add column next_run integer not null default 1;`,
	`create table ssh_keys (
		id integer primary key,
		user_id integer not null references users(id) on delete cascade,
		name text not null,
		type text not null,
		key text not null,
		fingerprint text not null unique,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		last_used_at text
	);`,
	// CI artifacts (actions/upload-artifact@v4): uploaded in blocks, then one zip per name per run.
	`create table artifacts (
		id integer primary key,
		run_id integer not null references runs(id) on delete cascade,
		job_id integer not null,
		name text not null,
		size integer not null default 0,
		status text not null default 'uploading',
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		expires_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+90 days')),
		unique (run_id, name)
	);`,
	// Redelivering a webhook needs what was sent; pull mirrors keep a remote they fetch from on a timer.
	`alter table hook_deliveries add column payload text not null default '';
	alter table hook_deliveries add column headers text not null default '{}';
	alter table repos add column mirror_url text;
	alter table repos add column mirror_interval integer not null default 0;
	alter table repos add column mirror_updated_at text;
	alter table repos add column mirror_error text;`,
	// Git LFS: which objects each repo has (the files live once under SHED_DATA/lfs, by oid), and file locks.
	`create table lfs_objects (
		repo_id integer not null references repos(id) on delete cascade,
		oid text not null,
		size integer not null,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		primary key (repo_id, oid)
	);
	create table lfs_locks (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		path text not null,
		user_id integer not null references users(id) on delete cascade,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (repo_id, path)
	);`,
	// Packages: a container registry (OCI distribution) and generic files, owned by a user or org. Blobs are stored once by digest;
	// an owner can only read blobs that were pushed to one of its packages.
	`create table packages (
		id integer primary key,
		owner_id integer not null references users(id) on delete cascade,
		type text not null check (type in ('container', 'generic')),
		name text not null,
		private integer not null default 1,
		repo_id integer references repos(id) on delete set null,
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (owner_id, type, name)
	);
	create table package_versions (
		id integer primary key,
		package_id integer not null references packages(id) on delete cascade,
		version text not null,
		digest text not null,
		media_type text not null default '',
		size integer not null default 0,
		user_id integer references users(id),
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		unique (package_id, version)
	);
	create table package_blobs (
		owner_id integer not null references users(id) on delete cascade,
		digest text not null,
		size integer not null,
		media_type text not null default '',
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		primary key (owner_id, digest)
	);`,
	// Project boards: columns of cards, each card an issue or PR of the repo, or a note.
	`create table projects (
		id integer primary key,
		repo_id integer not null references repos(id) on delete cascade,
		title text not null,
		description text not null default '',
		state text not null default 'open' check (state in ('open', 'closed')),
		created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	create table project_columns (
		id integer primary key,
		project_id integer not null references projects(id) on delete cascade,
		title text not null,
		position real not null default 0
	);
	create table project_cards (
		id integer primary key,
		column_id integer not null references project_columns(id) on delete cascade,
		issue_id integer references issues(id) on delete cascade,
		note text not null default '',
		position real not null default 0
	);`
];

export function openDb(path: string) {
	const db = new Database(path, { create: true, strict: true });
	db.run('pragma journal_mode = wal');
	db.run('pragma foreign_keys = on');
	db.run('pragma busy_timeout = 5000');
	const { user_version: at } = db.query<{ user_version: number }, []>('pragma user_version').get()!;
	if (at > MIGRATIONS.length) throw new Error(`${path} is from a newer Shed (schema ${at}, this build knows ${MIGRATIONS.length})`);
	db.transaction(() => {
		for (let i = at; i < MIGRATIONS.length; i++) db.run(MIGRATIONS[i]);
		db.run(`pragma user_version = ${MIGRATIONS.length}`);
	})();
	return db;
}
