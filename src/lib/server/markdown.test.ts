import { expect, test } from 'bun:test';
import { render } from './markdown.js';

test('escapes raw HTML and unsafe links', () => {
	const html = render('<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror=alert(1)>');
	expect(html).not.toContain('<script');
	expect(html).not.toContain('<img');
	expect(html).not.toContain('href="javascript');
});

test('relative links and images resolve to the repo', () => {
	const at = { repo: 'ada/sample', ref: 'feature/x', dir: 'docs' };
	const html = render('[a](guide.md) [b](../src/a.ts#L3) [c](/README.md) [d](https://x.nz) [e](#top)\n\n![logo](img/logo.png)', at);
	expect(html).toContain('href="/ada/sample/blob/feature%2Fx/docs/guide.md"');
	expect(html).toContain('href="/ada/sample/blob/feature%2Fx/src/a.ts#L3"');
	expect(html).toContain('href="/ada/sample/blob/feature%2Fx/README.md"');
	expect(html).toContain('href="https://x.nz"');
	expect(html).toContain('href="#top"');
	expect(html).toContain('src="/ada/sample/raw/feature%2Fx/docs/img/logo.png"');
});

test('headings get anchors and task lists get boxes', () => {
	const html = render('# Install it\n\n## Install it\n\n- [ ] todo\n- [x] done\n- plain');
	expect(html).toContain('<h1 id="install-it">');
	expect(html).toContain('<h2 id="install-it-1">');
	expect(html).toContain('<input type="checkbox" disabled> todo');
	expect(html).toContain('<input type="checkbox" disabled checked> done');
	expect(html).toContain('<li>plain</li>');
});

test('tables and strikethrough', () => {
	expect(render('| a | b |\n| - | - |\n| 1 | 2 |')).toContain('<table>');
	expect(render('~~gone~~')).toContain('<s>gone</s>');
});
