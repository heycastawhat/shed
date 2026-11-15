import { error } from '@sveltejs/kit';
import { parseKey, type SshKeyRow } from '../ssh.js';
import { me, route, type Ctx } from './router.js';

const json = (c: Ctx, k: SshKeyRow) => ({ id: k.id, title: k.name, key: `${k.type} ${k.key}`, fingerprint: k.fingerprint, created_at: k.created_at, last_used_at: k.last_used_at, url: `${c.origin}/api/v1/user/keys/${k.id}` });

route('GET', '/user/keys', (c) => c.db.query<SshKeyRow, [number]>('select * from ssh_keys where user_id = ? order by created_at desc').all(me(c).id).map((k) => json(c, k)));
route('POST', '/user/keys', async (c) => {
	const u = me(c);
	const b = await c.body<{ title?: string; key?: string }>();
	let k;
	try {
		k = parseKey(b.key ?? '');
	} catch (e) {
		error(422, (e as Error).message);
	}
	if (c.db.query('select 1 from ssh_keys where fingerprint = ?').get(k.fingerprint)) error(422, 'That key is already added to an account');
	const name = (b.title ?? '').trim() || (b.key ?? '').trim().split(/\s+/)[2] || 'key';
	const id = Number(c.db.query('insert into ssh_keys (user_id, name, type, key, fingerprint) values (?, ?, ?, ?, ?)').run(u.id, name, k.type, k.key, k.fingerprint).lastInsertRowid);
	return json(c, c.db.query<SshKeyRow, [number]>('select * from ssh_keys where id = ?').get(id)!);
});
route('DELETE', '/user/keys/:id', (c) => {
	if (!c.db.query('delete from ssh_keys where id = ? and user_id = ? returning id').get(Number(c.params.id), me(c).id)) error(404, 'Key not found');
});
