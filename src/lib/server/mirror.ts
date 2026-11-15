import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { git } from './git.js';
import { afterPush, refSnapshot } from './push.js';
import { createRepo, repoDir, type RepoRow } from './repos.js';

// Copying a repo from another server by URL ("migrate"), once or as a pull mirror that fetches on a timer. A mirror's branches and
// tags follow the remote exactly, so pushes to it are refused. The URL (which may carry a token) is stored encrypted.

type Crypt = { encrypt: (s: string) => Promise<string>; decrypt: (s: string) => Promise<string> };

export function remoteUrl(clone: string, auth?: { username?: string; password?: string; token?: string }) {
	const u = URL.parse(clone);
	if (!u || !/^https?:$/.test(u.protocol)) error(422, 'Only http(s) URLs can be copied');
	if (auth?.token) (u.username = auth.username || 'oauth2'), (u.password = auth.token);
	else if (auth?.username) (u.username = auth.username), (u.password = auth.password ?? '');
	return u.href;
}
// For showing: the URL without credentials.
export const publicUrl = (url: string) => {
	const u = URL.parse(url);
	if (!u) return '';
	u.username = u.password = '';
	return u.href;
};

async function fetchAll(dir: string, url: string) {
	// Only branches and tags, pruned so deletions upstream carry over; never credential prompts.
	await git(dir, ['-c', 'credential.helper=', 'fetch', '--quiet', '--prune', '--force', '--no-auto-gc', url, '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*'], undefined, { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'true' });
}

export async function migrate(
	db: Database,
	root: string,
	crypt: Crypt,
	ownerId: number,
	userId: number,
	o: { name: string; url: string; description?: string; private?: boolean; mirror?: boolean; interval?: number }
) {
	const id = await createRepo(db, root, ownerId, { name: o.name, description: o.description, private: o.private !== false });
	const dir = repoDir(root, id);
	try {
		await fetchAll(dir, o.url);
	} catch (e) {
		const { deleteRepo } = await import('./repos.js');
		await deleteRepo(db, root, id);
		error(422, `Couldn't fetch from ${publicUrl(o.url)}: ${String((e as Error).message).split('\n').at(-1)}`);
	}
	// The remote's default branch becomes ours.
	const head = (await git(dir, ['ls-remote', '--symref', o.url, 'HEAD'], undefined, { GIT_TERMINAL_PROMPT: '0' }).catch(() => '')).match(/ref: refs\/heads\/(\S+)\s+HEAD/)?.[1];
	const branch = head ?? (await git(dir, ['for-each-ref', '--count=1', '--format=%(refname:lstrip=2)', 'refs/heads'])).trim();
	if (branch) {
		await git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
		db.query('update repos set default_branch = ? where id = ?').run(branch, id);
	}
	if (o.mirror)
		db.query("update repos set mirror_url = ?, mirror_interval = ?, mirror_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(
			await crypt.encrypt(o.url),
			Math.max(10, o.interval ?? 480),
			id
		);
	void userId;
	return id;
}

type MirrorRow = RepoRow & { mirror_url: string; mirror_interval: number; mirror_updated_at: string | null };

export async function syncMirror(db: Database, root: string, crypt: Crypt, repo: MirrorRow) {
	const dir = repoDir(root, repo.id);
	const before = await refSnapshot(dir);
	try {
		await fetchAll(dir, await crypt.decrypt(repo.mirror_url));
		db.query("update repos set mirror_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), mirror_error = null where id = ?").run(repo.id);
	} catch (e) {
		db.query("update repos set mirror_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), mirror_error = ? where id = ?").run(String((e as Error).message).slice(0, 500), repo.id);
		return;
	}
	// Changes show up like pushes (activity, PR updates, CI), attributed to the repo's owner.
	await afterPush(db, root, repo, repo.owner_id, before);
}

// Mirrors whose interval (minutes) has passed.
export async function syncDueMirrors(db: Database, root: string, crypt: Crypt) {
	const due = db
		.query<MirrorRow, []>(
			"select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.mirror_url is not null and (r.mirror_updated_at is null or r.mirror_updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || r.mirror_interval || ' minutes'))"
		)
		.all();
	for (const r of due) await syncMirror(db, root, crypt, r);
}
