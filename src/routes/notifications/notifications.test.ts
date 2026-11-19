import { expect, test } from 'bun:test';
import { parse, type AST } from 'svelte/compiler';

function anchors(node: unknown): AST.RegularElement[] {
	if (!node || typeof node !== 'object') return [];
	if (Array.isArray(node)) return node.flatMap(anchors);
	const value = node as Record<string, unknown>;
	if (value.type === 'RegularElement' && value.name === 'a') return [node as AST.RegularElement];
	return Object.values(value).flatMap(anchors);
}

test('notification title links use browser navigation to the mark-read endpoint', async () => {
	const source = await Bun.file(new URL('./+page.svelte', import.meta.url)).text();
	const links = anchors(parse(source, { modern: true }).fragment).filter((a) => a.attributes.some((attr) =>
		attr.type === 'Attribute' && attr.name === 'href' && Array.isArray(attr.value) && attr.value.some((part) => part.type === 'Text' && part.data.startsWith('/notifications/'))
	));
	expect(links).toHaveLength(1);
	for (const link of links) {
		expect(link.attributes.find((attr) => attr.type === 'Attribute' && attr.name === 'data-sveltekit-reload')).toMatchObject({ value: true });
	}
});
