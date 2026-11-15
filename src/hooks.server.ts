import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { FORGEJO_TOKEN } from '$app/env/private';
import { sessionUser } from '#lib/server/accounts.js';
import { db } from '#lib/server/shed.js';
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
	event.locals.user = sessionUser(db, event.cookies.get('shed_session')) ?? undefined;
	// Bridge while pages move from Forgejo to Shed: a signed-in person's Forgejo calls use this one token.
	event.locals.token = event.locals.user && FORGEJO_TOKEN;
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
