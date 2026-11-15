import { error } from '@sveltejs/kit';
import type { UserRow } from '../accounts.js';
import { member } from '../registry.js';
import { userJson } from './common.js';
import { me, route, type Ctx } from './router.js';

type Pkg = { id: number; owner_id: number; type: string; name: string; private: number; created_at: string; updated_at: string };
type Version = { id: number; version: string; digest: string; media_type: string; size: number; user_id: number | null; created_at: string };

function owner(c: Ctx) {
	return c.db.query<UserRow, [string]>("select * from users where login = ? and kind != 'agent'").get(c.params.owner) ?? error(404, `No user or organization called ${c.params.owner}`);
}
const canRead = (c: Ctx, o: UserRow, p: Pkg) => !p.private || (!!c.user && member(c.db, o.id, c.user.id));
const json = (c: Ctx, o: UserRow, p: Pkg) => ({ id: p.id, owner: { login: o.login }, type: p.type, name: p.name, private: !!p.private, created_at: p.created_at, updated_at: p.updated_at });

route('GET', '/packages/:owner', (c) => {
	const o = owner(c);
	return c.db.query<Pkg, [number]>('select * from packages where owner_id = ? order by updated_at desc').all(o.id).filter((p) => canRead(c, o, p)).map((p) => json(c, o, p));
});
function pkgOf(c: Ctx) {
	const o = owner(c);
	const p = c.db.query<Pkg, [number, string, string]>('select * from packages where owner_id = ? and type = ? and name = ?').get(o.id, c.params.type, c.params.name);
	if (!p || !canRead(c, o, p)) error(404, 'Package not found');
	return { o, p };
}
route('GET', '/packages/:owner/:type/*name', (c) => {
	const { o, p } = pkgOf(c);
	const versions = c.db.query<Version, [number]>('select * from package_versions where package_id = ? order by created_at desc').all(p.id);
	return {
		...json(c, o, p),
		can_write: !!c.user && member(c.db, o.id, c.user.id),
		versions: versions
			.filter((v) => p.type !== 'container' || !v.version.startsWith('sha256:'))
			.map((v) => ({ version: v.version, digest: v.digest, size: v.size, created_at: v.created_at, by: userJson(c.db, v.user_id) }))
	};
});
route('PATCH', '/packages/:owner/:type/*name', async (c) => {
	const { o, p } = pkgOf(c);
	if (!member(c.db, o.id, me(c).id)) error(403, 'Only the owner can change this');
	const b = await c.body<{ private?: boolean }>();
	if (typeof b.private === 'boolean') c.db.query('update packages set private = ? where id = ?').run(+b.private, p.id);
});
route('DELETE', '/packages/:owner/:type/*name', async (c) => {
	const { o, p } = pkgOf(c);
	if (!member(c.db, o.id, me(c).id)) error(403, 'Only the owner can delete this');
	const version = c.url.searchParams.get('version');
	if (version) c.db.query('delete from package_versions where package_id = ? and (version = ? or version like ? || \'/%\')').run(p.id, version, version);
	else c.db.query('delete from packages where id = ?').run(p.id);
});
