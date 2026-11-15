import { error } from '@sveltejs/kit';
import type { UserRow } from '../accounts.js';
import { migrate, publicUrl, remoteUrl, syncMirror } from '../mirror.js';
import type { RepoRow } from '../repos.js';
import { repoJson, repoOf } from './common.js';
import { me, route } from './router.js';

const crypt = () => import('../store.js');
// Forgejo sends intervals like "8h0m0s"; Shed keeps minutes.
const minutes = (v: unknown) => {
	if (typeof v === 'number') return v;
	const m = String(v ?? '').match(/^(?:(\d+)h)?(?:(\d+)m)?(?:\d+s)?$/);
	return m && (m[1] || m[2]) ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 480;
};

route('POST', '/repos/migrate', async (c) => {
	const u = me(c);
	const b = await c.body<{ clone_addr: string; repo_name: string; repo_owner?: string; mirror?: boolean; private?: boolean; description?: string; auth_username?: string; auth_password?: string; auth_token?: string; mirror_interval?: string | number }>();
	let ownerId = u.id;
	if (b.repo_owner && b.repo_owner !== u.login) {
		const org = c.db.query<UserRow, [string]>("select * from users where login = ? and kind = 'org'").get(b.repo_owner) ?? error(404, `No organization called ${b.repo_owner}`);
		if (!c.db.query('select 1 from org_members where org_id = ? and user_id = ?').get(org.id, u.id)) error(403, `You're not a member of ${org.login}`);
		ownerId = org.id;
	}
	const url = remoteUrl(b.clone_addr ?? '', { username: b.auth_username, password: b.auth_password, token: b.auth_token });
	const id = await migrate(c.db, c.root, await crypt(), ownerId, u.id, { name: b.repo_name, url, description: b.description, private: b.private, mirror: b.mirror, interval: minutes(b.mirror_interval) });
	return repoJson(c, c.db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(id)!);
});

route('POST', '/repos/:owner/:repo/mirror-sync', async (c) => {
	const r = repoOf(c, 'write');
	const row = c.db.query<RepoRow & { mirror_url: string | null; mirror_interval: number; mirror_updated_at: string | null }, [number]>(
		'select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?'
	).get(r.row.id)!;
	if (!row.mirror_url) error(400, `${r.full} isn't a mirror`);
	await syncMirror(c.db, c.root, await crypt(), row as never);
});

// Mirror details for the repo page and settings (Shed extension).
route('GET', '/repos/:owner/:repo/mirror', async (c) => {
	const r = repoOf(c);
	const m = c.db.query<{ mirror_url: string | null; mirror_interval: number; mirror_updated_at: string | null; mirror_error: string | null }, [number]>(
		'select mirror_url, mirror_interval, mirror_updated_at, mirror_error from repos where id = ?'
	).get(r.row.id)!;
	if (!m.mirror_url) error(404, `${r.full} isn't a mirror`);
	return { url: publicUrl(await (await crypt()).decrypt(m.mirror_url)), interval: m.mirror_interval, updated_at: m.mirror_updated_at, error: m.mirror_error };
});
route('PATCH', '/repos/:owner/:repo/mirror', async (c) => {
	const r = repoOf(c, 'admin');
	const b = await c.body<{ interval?: number; stop?: boolean }>();
	if (b.stop) c.db.query('update repos set mirror_url = null where id = ?').run(r.row.id);
	else if (b.interval) c.db.query('update repos set mirror_interval = ? where id = ?').run(Math.max(10, b.interval), r.row.id);
});
