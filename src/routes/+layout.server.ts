import { read } from '#lib/server/store.js';

export async function load({ locals, cookies }) {
	const u = locals.user;
	const user = u ? { id: u.id, login: u.login, full_name: u.name, avatar_url: u.avatar_url, admin: !!u.admin } : null;
	const d = await read();
	return {
		user,
		waiting: user ? d.approvals.filter((a) => a.userId === user.id && a.status === 'pending').length : 0,
		pins: user ? (d.pins[user.id] ?? []) : [],
		nav: cookies.get('forge_nav') === 'bar' ? ('bar' as const) : ('sidebar' as const),
		collapsed: cookies.get('forge_nav_collapsed') === '1'
	};
}
