import { isTheme } from '#lib/themes.js';

const YEAR = {
	path: '/',
	sameSite: 'lax',
	maxAge: 60 * 60 * 24 * 365
} as const;

export const actions = {
	theme: async ({ cookies, request }) => {
		const theme = String((await request.formData()).get('theme'));
		if (theme === 'light' || theme === 'dark') cookies.set('forge_theme', theme, YEAR);
		else cookies.delete('forge_theme', { path: '/' });
	},
	palette: async ({ cookies, request }) => {
		const palette = String((await request.formData()).get('palette'));
		if (isTheme(palette)) cookies.set('forge_palette', palette, YEAR);
		else cookies.delete('forge_palette', { path: '/' });
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
