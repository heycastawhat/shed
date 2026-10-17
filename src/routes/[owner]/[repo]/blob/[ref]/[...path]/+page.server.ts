import { redirect } from '@sveltejs/kit';
import { api, encodePath, renderMarkdown, type Entry } from '#lib/server/forgejo.js';
import { highlight } from '#lib/server/highlight.js';

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i;
const MAX_HIGHLIGHT = 512 * 1024;

export async function load({ locals, params, url }) {
	const repo = `${params.owner}/${params.repo}`;
	const file = await api<Entry | Entry[]>(locals.token, `/repos/${repo}/contents/${encodePath(params.path)}?ref=${encodeURIComponent(params.ref)}`);
	// Relative links in markdown can point at folders.
	if (Array.isArray(file)) redirect(303, `/${repo}/tree/${encodeURIComponent(params.ref)}/${params.path}`);
	const meta = { name: file.name, size: file.size };

	if (IMAGE.test(file.name)) return { ...meta, kind: 'image' as const };
	// Forgejo omits content for blobs over its API size limit.
	if (file.content == null) return { ...meta, kind: 'large' as const };

	const bytes = Uint8Array.fromBase64(file.content);
	if (bytes.subarray(0, 8000).includes(0)) return { ...meta, kind: 'binary' as const };

	const text = new TextDecoder().decode(bytes);
	const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
	if (/\.(md|markdown)$/i.test(file.name) && !url.searchParams.has('plain'))
		return { ...meta, lines, kind: 'markdown' as const, html: await renderMarkdown(locals.token, text, repo, { ref: params.ref, dir: params.path.split('/').slice(0, -1).join('/') }) };
	if (bytes.length > MAX_HIGHLIGHT) return { ...meta, lines, kind: 'plain' as const, text };
	return { ...meta, lines, kind: 'code' as const, html: await highlight(text, file.name) };
}
