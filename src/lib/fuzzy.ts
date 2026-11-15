// Subsequence matching for the file finder: every query character in order, scored up for runs, word starts and hits in the file name.
export function fuzzy(query: string, path: string) {
	const q = query.toLowerCase().replace(/\s+/g, '');
	if (!q) return { score: 0, hits: [] as number[] };
	const p = path.toLowerCase();
	const base = p.lastIndexOf('/') + 1;
	let best: { score: number; hits: number[] } | null = null;
	for (const start of base ? [base, 0] : [0]) {
		const hits: number[] = [];
		let score = -p.length / 100;
		let at = start;
		for (const ch of q) {
			const i = p.indexOf(ch, at);
			if (i < 0) {
				score = -Infinity;
				break;
			}
			score += 1 + (i === hits.at(-1)! + 1 ? 5 : 0) + (i === 0 || '/._- '.includes(p[i - 1]) ? 3 : 0) + (i >= base ? 1 : 0);
			hits.push(i);
			at = i + 1;
		}
		// A query that ends where a name or word does ("browse" in browse.ts, not browser.md).
		if ('/._- '.includes(p[hits.at(-1)! + 1] ?? '/')) score += 3;
		if (score > -Infinity && (!best || score > best.score)) best = { score, hits };
	}
	return best;
}

export function rank(query: string, paths: string[], max = 50) {
	const out: { path: string; score: number; hits: number[] }[] = [];
	for (const path of paths) {
		const m = fuzzy(query, path);
		if (m) out.push({ path, ...m });
	}
	return out.sort((a, b) => b.score - a.score || a.path.length - b.path.length).slice(0, max);
}
