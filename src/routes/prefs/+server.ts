import { error, json } from '@sveltejs/kit';
import { cookie } from '#lib/server/auth.js';

// UI preferences live in cookies so the server can render the right shell on the first paint.
const YEAR = 60 * 60 * 24 * 365;

export async function POST({ cookies, request, url }) {
	const patch = await request.json().catch(() => error(400, 'Expected JSON'));
	if (patch.nav !== undefined) {
		if (patch.nav !== 'sidebar' && patch.nav !== 'bar') error(400, 'nav must be sidebar or bar');
		cookies.set('forge_nav', patch.nav, cookie(url, YEAR));
	}
	if (patch.tabs !== undefined) cookies.set('forge_tabs', patch.tabs ? '1' : '0', cookie(url, YEAR));
	if (patch.collapsed !== undefined) cookies.set('forge_nav_collapsed', patch.collapsed ? '1' : '0', cookie(url, YEAR));
	return json({ ok: true });
}
