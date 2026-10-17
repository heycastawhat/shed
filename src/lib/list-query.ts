// Links on issue and PR lists keep the other filters but go back to the first page.
export function listQuery(url: { search: string }, set: Record<string, string | number | null | undefined>) {
	const q = new URLSearchParams(url.search);
	q.delete('page');
	for (const [k, v] of Object.entries(set)) {
		if (v == null || v === '') q.delete(k);
		else q.set(k, String(v));
	}
	return `?${q}`;
}
