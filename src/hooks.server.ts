import type { Handle } from '@sveltejs/kit/hooks';
import { sessionToken } from '#lib/server/auth.js';
import { sweepMentions } from '#lib/server/mention.js';
import { isTheme } from '#lib/themes.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.token = await sessionToken(event.cookies);
	sweepMentions();
	// Set on <html> while rendering so a chosen theme doesn't flash the OS one first.
	const theme = event.cookies.get('forge_theme');
	const palette = event.cookies.get('forge_palette');
	const attrs = (theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : '') + (isTheme(palette) ? ` data-palette="${palette}"` : '');
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="en"${attrs}>`)
	});
};
