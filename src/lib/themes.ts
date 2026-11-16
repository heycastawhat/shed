// The last four are Material 3 roles; palettes that don't set them get them mixed from the others in app.css.
type Vars = {
	bg: string;
	surface: string;
	fg: string;
	muted: string;
	border: string;
	accent: string;
	shell?: string;
	onAccent?: string;
	accentContainer?: string;
	onAccentContainer?: string;
};
export type Theme = { name: string; seed?: string; light: Vars; dark: Vars };

// `forge` (Shed) is the default; the rest apply through `data-palette` on <html>. The seeded ones are Material 3 tonal-spot palettes
// made from one colour by .agents/scripts/m3-palettes.ts, as Sink makes its theme; the named ones are hand-picked.
export const THEMES: Record<string, Theme> = {
	forge: {
		name: 'Shed',
		seed: '#6750A4',
		light: {bg: '#fafafc', surface: '#f8f2fa', shell: '#f2ecf4', fg: '#1d1b20', muted: '#49454e', border: '#dfdce2', accent: '#65558f', onAccent: '#ffffff', accentContainer: '#e8def8', onAccentContainer: '#4a4458'},
		dark: {bg: '#1c1923', surface: '#1d1b20', shell: '#211f24', fg: '#e6e0e9', muted: '#cac4cf', border: '#3b373f', accent: '#cfbdfe', onAccent: '#36275d', accentContainer: '#4a4458', onAccentContainer: '#e8def8'}
	},
	teal: {
		name: 'Teal',
		seed: '#006A6A',
		light: {bg: '#f7fbfb', surface: '#eff5f4', shell: '#e9efee', fg: '#161d1d', muted: '#3f4948', border: '#d8dfde', accent: '#006a6a', onAccent: '#ffffff', accentContainer: '#cce8e7', onAccentContainer: '#324b4b'},
		dark: {bg: '#111d1d', surface: '#161d1d', shell: '#1a2121', fg: '#dde4e3', muted: '#bec9c8', border: '#323b3a', accent: '#80d5d4', onAccent: '#003737', accentContainer: '#324b4b', onAccentContainer: '#cce8e7'}
	},
	red: {
		name: 'Red',
		seed: '#B3261E',
		light: {bg: '#fcfaf9', surface: '#fff0ee', shell: '#fceae7', fg: '#231918', muted: '#534341', border: '#e8dad8', accent: '#904a42', onAccent: '#ffffff', accentContainer: '#ffdad5', onAccentContainer: '#5d3f3b'},
		dark: {bg: '#241816', surface: '#231918', shell: '#271d1c', fg: '#f1dedc', muted: '#d8c2be', border: '#433534', accent: '#ffb4aa', onAccent: '#561e18', accentContainer: '#5d3f3b', onAccentContainer: '#ffdad5'}
	},
	orange: {
		name: 'Orange',
		seed: '#8B5000',
		light: {bg: '#fbfaf8', surface: '#fff1e7', shell: '#faebe0', fg: '#211a14', muted: '#51453a', border: '#e6dbd3', accent: '#865319', onAccent: '#ffffff', accentContainer: '#ffdcbe', onAccentContainer: '#59422d'},
		dark: {bg: '#23190f', surface: '#211a14', shell: '#261e18', fg: '#efe0d5', muted: '#d5c3b5', border: '#42372d', accent: '#fdb975', onAccent: '#4a2800', accentContainer: '#59422d', onAccentContainer: '#ffdcbe'}
	},
	green: {
		name: 'Green',
		seed: '#386A20',
		light: {bg: '#f9faf9', surface: '#f2f5ea', shell: '#edefe5', fg: '#191d16', muted: '#43483e', border: '#dbded6', accent: '#446732', onAccent: '#ffffff', accentContainer: '#d8e7cb', onAccentContainer: '#3e4a35'},
		dark: {bg: '#171d13', surface: '#191d16', shell: '#1d211a', fg: '#e1e4d9', muted: '#c3c8bb', border: '#353a31', accent: '#a9d291', onAccent: '#173807', accentContainer: '#3e4a35', onAccentContainer: '#d8e7cb'}
	},
	blue: {
		name: 'Blue',
		seed: '#0061A4',
		light: {bg: '#f9fafc', surface: '#f2f3fa', shell: '#eceef4', fg: '#191c20', muted: '#43474e', border: '#dbdde2', accent: '#36618e', onAccent: '#ffffff', accentContainer: '#d7e3f8', onAccentContainer: '#3b4858'},
		dark: {bg: '#151b23', surface: '#191c20', shell: '#1d2024', fg: '#e1e2e8', muted: '#c3c6cf', border: '#35393f', accent: '#a0cafd', onAccent: '#003258', accentContainer: '#3b4858', onAccentContainer: '#d7e3f8'}
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
		.map(([k, c]) => `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${c};`)
		.join('');

// Same light/dark override pattern as app.css, one selector deeper so a palette beats the default.
export const themeCss = Object.entries(THEMES)
	.map(([id, t]) => {
		// The default palette goes on :root itself (with :where so any data-palette one wins).
		const p = id === 'forge' ? `:root:where(:not([data-palette]))` : `:root[data-palette='${id}']`;
		return `${p}{${block(t.light)}}@media (prefers-color-scheme: dark){${p}:not([data-theme='light']){${block(t.dark)}}}${p}[data-theme='dark']{${block(t.dark)}}`;
	})
	.join('');

// <meta name="theme-color"> for the browser's and the installed app's status bar: the shell colour of the chosen palette and mode.
export function themeColor(theme: string | undefined, palette: string | undefined) {
	const t = THEMES[isTheme(palette) ? palette : 'forge'];
	const meta = (v: Vars, media = '') => `<meta name="theme-color" content="${v.shell ?? v.surface}"${media && ` media="${media}"`} />`;
	if (theme === 'light' || theme === 'dark') return meta(t[theme]);
	return meta(t.light, '(prefers-color-scheme: light)') + meta(t.dark, '(prefers-color-scheme: dark)');
}
