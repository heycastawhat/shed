import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { getUser, sessionUser, tokenAuth } from '#lib/server/accounts.js';
import { dispatch } from '#lib/server/api/index.js';
import { internalToken } from '#lib/server/api/internal.js';
import { gitHttp, isGitRequest } from '#lib/server/githttp.js';
import { db, root, setOrigin } from '#lib/server/shed.js';
import { sweepMentions } from '#lib/server/mention.js';
import { read } from '#lib/server/store.js';
import { isTheme } from '#lib/themes.js';

// Load forge.json and open shed.db (the import above) before serving anything, so a corrupt file stops the server instead of failing every request.
export const init: ServerInit = async () => {
	await read();
	db.query('select 1').get();
};

const SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-frame-options': 'DENY'
};

export const handle: Handle = async ({ event, resolve }) => {
	setOrigin(event.url.origin);
	if (isGitRequest(event.url)) return gitHttp(db, root, event.request, event.url);
	// The REST API for scripts and tools: a Shed token as `token …`, `Bearer …` or a Basic password. Cookies don't count, so no CSRF.
	if (event.url.pathname.startsWith('/api/v1/')) {
		const h = event.request.headers.get('authorization') ?? '';
		const raw = h.match(/^(?:token|bearer)\s+(.+)$/i)?.[1] ?? (h.match(/^basic\s+(.+)$/i) ? new TextDecoder().decode(Uint8Array.fromBase64(h.split(/\s+/)[1])).split(':').slice(1).join(':') : undefined);
		const t = raw ? tokenAuth(db, raw) : null;
		if (raw && !t) return new Response(JSON.stringify({ message: 'That token is unknown or expired' }), { status: 401, headers: { 'content-type': 'application/json' } });
		return dispatch(db, root, event.url.origin, event.request, { user: t ? getUser(db, t.userId) : null, token: t });
	}
	event.locals.user = sessionUser(db, event.cookies.get('shed_session')) ?? undefined;
	// Pages call Shed's API in-process as the signed-in person.
	event.locals.token = event.locals.user ? internalToken(event.locals.user.id) : undefined;
	sweepMentions();
	// Set on <html> while rendering so a chosen theme doesn't flash the OS one first.
	const theme = event.cookies.get('forge_theme');
	const palette = event.cookies.get('forge_palette');
	const attrs = (theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : '') + (isTheme(palette) ? ` data-palette="${palette}"` : '');
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="en"${attrs}>`)
	});
	for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!response.headers.has(k)) response.headers.set(k, v);
	return response;
};
