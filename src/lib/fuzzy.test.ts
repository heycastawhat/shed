import { expect, test } from 'bun:test';
import { fuzzy, rank } from './fuzzy.js';

test('matches characters in order, anywhere in the path', () => {
	expect(fuzzy('rdm', 'README.md')?.hits).toEqual([0, 3, 4]);
	expect(fuzzy('xyz', 'README.md')).toBeNull();
	expect(fuzzy('', 'a')).toEqual({ score: 0, hits: [] });
});

test('ranks file-name and consecutive matches first', () => {
	const paths = ['src/lib/server/browse.ts', 'src/routes/blame/+page.svelte', 'docs/browser.md', 'src/lib/components/Tree.svelte'];
	expect(rank('browse', paths).map((r) => r.path)).toEqual(['src/lib/server/browse.ts', 'docs/browser.md']);
	expect(rank('tree', paths)[0].path).toBe('src/lib/components/Tree.svelte');
	expect(rank('srvbrowse', paths)[0].path).toBe('src/lib/server/browse.ts');
});
