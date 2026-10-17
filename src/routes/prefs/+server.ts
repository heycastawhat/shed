import { error, json } from '@sveltejs/kit';

// UI preferences live in cookies so the server can render the right shell on the first paint.
const YEAR = 60 * 60 * 24 * 365;

export async function POST({ cookies, request }) {
	const patch = await request.json().catch(() => error(400, 'Expected JSON'));
	if (patch.nav !== undefined) {
		if (patch.nav !== 'sidebar' && patch.nav !== 'bar') error(400, 'nav must be sidebar or bar');
		cookies.set('forge_nav', patch.nav, { path: '/', sameSite: 'lax', maxAge: YEAR });
	}
	if (patch.collapsed !== undefined) cookies.set('forge_nav_collapsed', patch.collapsed ? '1' : '0', { path: '/', sameSite: 'lax', maxAge: YEAR });
	return json({ ok: true });
}
