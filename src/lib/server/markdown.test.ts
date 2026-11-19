import { expect, test } from 'bun:test';
import { mentions, render } from './markdown.js';

test('mention extraction uses rendered links, including punctuation and dotted logins', () => {
	for (const text of ['Thanks @ada.', 'Thanks @ada. Please look', '@ada..', '(@ada)', '@ADA']) expect([...mentions(text)]).toEqual(['ada']);
	for (const text of ['', '@ada-', '`@ada`', '```\n@ada\n```', '[@ada](https://example.com)', '@@ada']) expect([...mentions(text)]).toEqual([]);
	expect([...mentions('@ada.dev @ada.-dev @ada.dev')]).toEqual(['ada.dev', 'ada.-dev']);
});

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

test('relative links and images preserve the full query and fragment suffix', () => {
	const at = { repo: 'ada/sample', ref: 'main', dir: 'docs' };
	const html = render('[guide](guide.md?plain=1#install) ![logo](logo.svg?v=2#icon)', at);
	expect(html).toContain('href="/ada/sample/blob/main/docs/guide.md?plain=1#install"');
	expect(html).toContain('src="/ada/sample/raw/main/docs/logo.svg?v=2#icon"');
	expect(render('[guide](guide.md?#install)', at)).toContain('guide.md?#install');
	expect(render('[guide](guide.md#install?example)', at)).toContain('guide.md#install?example');
	expect(render('[external](https://example.com/?q=1#install)', at)).toContain('href="https://example.com/?q=1#install"');
	expect(render('', at)).toBe('');
});

test('tables and strikethrough', () => {
	expect(render('| a | b |\n| - | - |\n| 1 | 2 |')).toContain('<table>');
	expect(render('~~gone~~')).toContain('<s>gone</s>');
});

test('issue, PR, mention and commit references become links, except in code and links', () => {
	const at = { repo: 'ada/sample', ref: '', dir: '' };
	const html = render('Fixes #12 and kiwi/website#3, thanks @reviewer. See 1a2b3c4d and [#9](https://x.nz).\n\n`#7 @ada` and\n\n```\n#8\n```', at);
	expect(html).toContain('Fixes <a href="/ada/sample/issues/12">#12</a>');
	expect(html).toContain('<a href="/kiwi/website/issues/3">kiwi/website#3</a>');
	expect(html).toContain('thanks <a href="/reviewer">@reviewer</a>.');
	expect(html).toContain('See <a href="/ada/sample/commit/1a2b3c4d">1a2b3c4d</a>');
	expect(html).toContain('<a href="https://x.nz">#9</a>');
	expect(html).toContain('<code>#7 @ada</code>');
	expect(html).toContain('<pre><code>#8\n</code></pre>');
});

test('references need the right context and shape', () => {
	// No repo: bare numbers and SHAs stay text, qualified ones still link.
	expect(render('#4 and 1a2b3c4d and a/b#5')).toBe('<p>#4 and 1a2b3c4d and <a href="/a/b/issues/5">a/b#5</a></p>\n');
	const at = { repo: 'ada/sample', ref: 'main', dir: '' };
	// Emails, URL fragments, entities, @agent, reserved paths, plain words and numbers aren't references.
	for (const s of ['mail ada@x', 'page#12', 'defaced', '1234567', '@agent do it', '@settings', 'abc#12x'])
		expect(render(s, at)).not.toContain('<a');
	expect(render('https://x.nz/a#12', at)).toBe('<p><a href="https://x.nz/a#12">https://x.nz/a#12</a></p>\n');
	// Links made by references aren't treated as repo-relative paths.
	expect(render('#3 in a README', at)).toContain('href="/ada/sample/issues/3"');
	expect(render('(#3), @a.b.', at)).toBe('<p>(<a href="/ada/sample/issues/3">#3</a>), <a href="/a.b">@a.b</a>.</p>\n');
});
