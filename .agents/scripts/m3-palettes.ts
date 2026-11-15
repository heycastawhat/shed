// Prints Material 3 (tonal spot) palettes for themes.ts from seed colours, the way Sink's m3e-theme derives its colours.
// Run: bun .agents/scripts/m3-palettes.ts   (then paste into src/lib/themes.ts)
import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot, MaterialDynamicColors as M } from '@material/material-color-utilities';

const SEEDS: [string, string, string][] = [
	['forge', 'Shed', '#6750A4'],
	['teal', 'Teal', '#006A6A'],
	['red', 'Red', '#B3261E'],
	['orange', 'Orange', '#8B5000'],
	['green', 'Green', '#386A20'],
	['blue', 'Blue', '#0061A4']
];
const mix = (a: string, b: string, t: number) => {
	const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const [x, y] = [p(a), p(b)];
	return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};
for (const [id, name, seed] of SEEDS) {
	const out: Record<string, Record<string, string>> = {};
	for (const dark of [false, true]) {
		const s = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0);
		const g = (c: { getArgb: (s: SchemeTonalSpot) => number }) => hexFromArgb(c.getArgb(s));
		const primary = g(M.primary);
		out[dark ? 'dark' : 'light'] = {
			// The page's sheet: the lowest surface with a touch of the accent, as in Sink.
			bg: mix(primary, g(M.surfaceContainerLowest), dark ? 0.07 : 0.03),
			surface: g(M.surfaceContainerLow),
			shell: g(M.surfaceContainer),
			fg: g(M.onSurface),
			muted: g(M.onSurfaceVariant),
			border: mix(g(M.outlineVariant), g(M.surfaceContainerLowest), dark ? 0.75 : 0.6),
			accent: primary,
			onAccent: g(M.onPrimary),
			accentContainer: g(M.secondaryContainer),
			onAccentContainer: g(M.onSecondaryContainer)
		};
	}
	console.log(`\t${id}: {\n\t\tname: '${name}',\n\t\tseed: '${seed}',\n\t\tlight: ${JSON.stringify(out.light).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,/g, ', ')},\n\t\tdark: ${JSON.stringify(out.dark).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,/g, ', ')}\n\t},`);
}
