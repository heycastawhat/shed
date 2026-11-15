import { error } from '@sveltejs/kit';
import { blame, blobSize, objectType, readBlob, resolve } from '#lib/server/browse.js';
import { highlightLines, languageFor } from '#lib/server/highlight.js';
import { db } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';
import { toUser, type UserRow } from '#lib/server/accounts.js';

const MAX = 1024 * 1024;

export async function load({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha) error(404, `No branch, tag or commit called ${params.ref}`);
	if ((await objectType(dir, sha, params.path)) !== 'blob') error(404, `${params.path} isn't a file in ${params.ref}`);
	if ((await blobSize(dir, sha, params.path)) > MAX) error(422, `${params.path} is too large to blame`);
	const bytes = await readBlob(dir, sha, params.path);
	if (bytes.subarray(0, 8000).includes(0)) error(422, `${params.path} is a binary file`);
	const [b, html] = await Promise.all([blame(dir, sha, params.path), highlightLines(new TextDecoder().decode(bytes).replace(/\n$/, '').split('\n'), languageFor(params.path.split('/').pop()!))]);
	// Authors matched to accounts by email, for avatars and profile links.
	const emails = [...new Set(Object.values(b.commits).map((c) => c.email.toLowerCase()))];
	const users = emails.length
		? db.query<UserRow, string[]>(`select * from users where email in (${emails.map(() => '?').join(',')}) collate nocase`).all(...emails)
		: [];
	const byEmail = Object.fromEntries(users.map((u) => [u.email!.toLowerCase(), { login: u.login, avatar_url: toUser(u).avatar_url }]));
	const commits = Object.fromEntries(
		Object.values(b.commits).map((c) => [c.sha, { ...c, date: new Date(c.time * 1000).toISOString(), user: byEmail[c.email.toLowerCase()] ?? null }])
	);
	return { commit: sha, html, ranges: b.ranges, commits };
}
