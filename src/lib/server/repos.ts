import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { mkdir, rename } from 'node:fs/promises';
import { initBare } from './git.js';

// Repos live on disk by id, not name, so a rename or transfer only touches the database and no URL part ever becomes a path.
export const repoDir = (root: string, id: number) => `${root}/repos/${id}.git`;

// Letters, digits, '.', '-', '_'; starting with a letter or digit (so never '.' or '..'), and never ending in .git, which clone URLs add.
export function checkName(name: string, what = 'Name') {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) || /\.git$/i.test(name)) error(400, `${what} can use letters, digits, '.', '-' and '_', must start with a letter or digit, and can't end in .git`);
	return name;
}

export type RepoRow = {
	id: number;
	owner_id: number;
	owner: string;
	name: string;
	description: string;
	private: number;
	default_branch: string;
	archived: number;
	created_at: string;
	updated_at: string;
};

const SELECT = 'select r.*, u.login as owner from repos r join users u on u.id = r.owner_id';

export function getRepo(db: Database, owner: string, name: string) {
	return db.query<RepoRow, [string, string]>(`${SELECT} where u.login = ? and r.name = ?`).get(owner, name);
}

export function listRepos(db: Database, ownerId: number) {
	return db.query<RepoRow, [number]>(`${SELECT} where r.owner_id = ? order by r.updated_at desc`).all(ownerId);
}

export async function createRepo(db: Database, root: string, ownerId: number, input: { name: string; description?: string; private?: boolean; defaultBranch?: string }) {
	checkName(input.name, 'Repo name');
	const branch = input.defaultBranch ?? 'main';
	if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) error(400, 'Invalid default branch name');
	let id: number;
	try {
		id = Number(
			db.query('insert into repos (owner_id, name, description, private, default_branch) values (?, ?, ?, ?, ?)').run(ownerId, input.name, input.description ?? '', input.private === false ? 0 : 1, branch)
				.lastInsertRowid
		);
	} catch (e) {
		if (String(e).includes('UNIQUE')) error(409, `A repo called ${input.name} already exists`);
		throw e;
	}
	try {
		await mkdir(`${root}/repos`, { recursive: true });
		await initBare(repoDir(root, id), branch);
	} catch (e) {
		db.query('delete from repos where id = ?').run(id);
		throw e;
	}
	return id;
}

// The git data goes to trash/ rather than being deleted, so a mistaken delete can be undone by hand.
export async function deleteRepo(db: Database, root: string, id: number) {
	await mkdir(`${root}/trash`, { recursive: true });
	await rename(repoDir(root, id), `${root}/trash/${id}-${Date.now()}.git`);
	db.query('delete from repos where id = ?').run(id);
}
