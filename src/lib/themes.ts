type Vars = {
	bg: string;
	surface: string;
	fg: string;
	muted: string;
	border: string;
	accent: string;
};
export type Theme = { name: string; light: Vars; dark: Vars };

// `forge` is app.css's own palette; the rest override it through `data-palette` on <html>.
export const THEMES: Record<string, Theme> = {
	forge: {
		name: 'Forge',
		light: {
			bg: '#ffffff',
			surface: '#f6f7f9',
			fg: '#1a1b1e',
			muted: '#6b7079',
			border: '#e3e5e8',
			accent: '#5b5bd6'
		},
		dark: {
			bg: '#111214',
			surface: '#18191c',
			fg: '#e6e7ea',
			muted: '#8b9099',
			border: '#26282c',
			accent: '#8b8bf0'
		}
	},
	catppuccin: {
		name: 'Catppuccin',
		light: {
			bg: '#eff1f5',
			surface: '#e6e9ef',
			fg: '#4c4f69',
			muted: '#6c6f85',
			border: '#ccd0da',
			accent: '#8839ef'
		},
		dark: {
			bg: '#1e1e2e',
			surface: '#181825',
			fg: '#cdd6f4',
			muted: '#9399b2',
			border: '#313244',
			accent: '#cba6f7'
		}
	},
	rosepine: {
		name: 'Rosé Pine',
		light: {
			bg: '#faf4ed',
			surface: '#fffaf3',
			fg: '#575279',
			muted: '#797593',
			border: '#dfdad9',
			accent: '#907aa9'
		},
		dark: {
			bg: '#191724',
			surface: '#1f1d2e',
			fg: '#e0def4',
			muted: '#908caa',
			border: '#2a2740',
			accent: '#c4a7e7'
		}
	},
	nord: {
		name: 'Nord',
		light: {
			bg: '#eceff4',
			surface: '#e5e9f0',
			fg: '#2e3440',
			muted: '#5e6779',
			border: '#d8dee9',
			accent: '#5e81ac'
		},
		dark: {
			bg: '#2e3440',
			surface: '#3b4252',
			fg: '#eceff4',
			muted: '#9aa3b5',
			border: '#434c5e',
			accent: '#88c0d0'
		}
	},
	gruvbox: {
		name: 'Gruvbox',
		light: {
			bg: '#fbf1c7',
			surface: '#f2e5bc',
			fg: '#3c3836',
			muted: '#7c6f64',
			border: '#d5c4a1',
			accent: '#af3a03'
		},
		dark: {
			bg: '#282828',
			surface: '#32302f',
			fg: '#ebdbb2',
			muted: '#a89984',
			border: '#45403d',
			accent: '#fe8019'
		}
	},
	mono: {
		name: 'Mono',
		light: {
			bg: '#ffffff',
			surface: '#f5f5f5',
			fg: '#171717',
			muted: '#737373',
			border: '#e5e5e5',
			accent: '#171717'
		},
		dark: {
			bg: '#0a0a0a',
			surface: '#161616',
			fg: '#ededed',
			muted: '#8a8a8a',
			border: '#262626',
			accent: '#ededed'
		}
	}
};

export const isTheme = (t: string | undefined): t is string => !!t && t !== 'forge' && t in THEMES;

const block = (v: Vars) =>
	Object.entries(v)
		.map(([k, c]) => `--${k}:${c};`)
		.join('');

// Same light/dark override pattern as app.css, one selector deeper so a palette beats the default.
export const themeCss = Object.entries(THEMES)
	.filter(([id]) => id !== 'forge')
	.map(([id, t]) => {
		const p = `:root[data-palette='${id}']`;
		return `${p}{${block(t.light)}}@media (prefers-color-scheme: dark){${p}:not([data-theme='light']){${block(t.dark)}}}${p}[data-theme='dark']{${block(t.dark)}}`;
	})
	.join('');
