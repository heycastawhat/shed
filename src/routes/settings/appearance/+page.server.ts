import { cookie } from '#lib/server/auth.js';
import { isTheme } from '#lib/themes.js';

const YEAR = 60 * 60 * 24 * 365;

export const actions = {
	theme: async ({ cookies, request, url }) => {
		const theme = String((await request.formData()).get('theme'));
		if (theme === 'light' || theme === 'dark') cookies.set('forge_theme', theme, cookie(url, YEAR));
		else cookies.delete('forge_theme', cookie(url));
	},
	palette: async ({ cookies, request, url }) => {
		const palette = String((await request.formData()).get('palette'));
		if (isTheme(palette)) cookies.set('forge_palette', palette, cookie(url, YEAR));
		else cookies.delete('forge_palette', cookie(url));
	}
};

export function load({ cookies }) {
	const theme = cookies.get('forge_theme');
	const palette = cookies.get('forge_palette');
	return {
		theme: theme === 'light' || theme === 'dark' ? theme : 'system',
		palette: isTheme(palette) ? palette : 'forge'
	};
}
