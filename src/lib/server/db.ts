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
	`alter table users add column avatar_url text not null default '';`
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
