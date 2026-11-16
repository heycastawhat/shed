import { gitTry } from './git.js';

// A repo's main language, as Forgejo's `language`: the language with the most bytes on the default branch, by file
// extension (vendored, generated and lock files left out). Cached by commit, since the tree only changes with it.
const LANGS: Record<string, string> = {
	ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
	svelte: 'Svelte', vue: 'Vue', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', swift: 'Swift',
	c: 'C', h: 'C', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++', cs: 'C#', php: 'PHP', lua: 'Lua', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
	ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hs: 'Haskell', ml: 'OCaml', scala: 'Scala', clj: 'Clojure', dart: 'Dart', zig: 'Zig', nim: 'Nim',
	html: 'HTML', css: 'CSS', scss: 'SCSS', sql: 'SQL', nix: 'Nix', tf: 'HCL', r: 'R', jl: 'Julia', pl: 'Perl', gd: 'GDScript', astro: 'Astro'
};
const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.git|third_party)\/|\.min\.|(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$/;
const cache = new Map<string, string | null>();

export async function primaryLanguage(dir: string, sha: string) {
	if (cache.has(sha)) return cache.get(sha)!;
	const out = await gitTry(dir, ['ls-tree', '-r', '-l', '--full-tree', sha]);
	const bytes = new Map<string, number>();
	for (const line of (out ?? '').split('\n')) {
		const m = line.match(/^\d+ blob [0-9a-f]+\s+(\d+)\t(.+)$/);
		if (!m || SKIP.test(m[2])) continue;
		const lang = LANGS[m[2].split('.').pop()!.toLowerCase()];
		if (lang) bytes.set(lang, (bytes.get(lang) ?? 0) + Number(m[1]));
	}
	const top = [...bytes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	if (cache.size > 2000) cache.clear();
	cache.set(sha, top);
	return top;
}
