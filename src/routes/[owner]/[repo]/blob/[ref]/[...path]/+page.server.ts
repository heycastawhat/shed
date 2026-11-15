import { error, redirect } from '@sveltejs/kit';
import { blobSize, objectType, readBlob, resolve } from '#lib/server/browse.js';
import { highlight } from '#lib/server/highlight.js';
import { render } from '#lib/server/markdown.js';
import { repoFor } from '#lib/server/shedrepo.js';

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i;
const MAX_HIGHLIGHT = 512 * 1024;
const MAX_SHOWN = 5 * 1024 * 1024;

export async function load({ locals, params, url }) {
	const repo = `${params.owner}/${params.repo}`;
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha) error(404, `No branch, tag or commit called ${params.ref}`);
	const type = await objectType(dir, sha, params.path);
	// Relative links in markdown can point at folders.
	if (type === 'tree') redirect(303, `/${repo}/tree/${encodeURIComponent(params.ref)}/${params.path}`);
	if (type !== 'blob') error(404, `${params.path} doesn't exist in ${params.ref}`);
	const name = params.path.split('/').pop()!;
	const size = await blobSize(dir, sha, params.path);
	const meta = { name, size };

	if (IMAGE.test(name)) return { ...meta, kind: 'image' as const };
	if (size > MAX_SHOWN) return { ...meta, kind: 'large' as const };

	const bytes = await readBlob(dir, sha, params.path);
	if (bytes.subarray(0, 8000).includes(0)) return { ...meta, kind: 'binary' as const };

	const text = new TextDecoder().decode(bytes);
	const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
	if (/\.(md|markdown)$/i.test(name) && !url.searchParams.has('plain'))
		return { ...meta, lines, kind: 'markdown' as const, html: render(text, { repo, ref: params.ref, dir: params.path.split('/').slice(0, -1).join('/') }) };
	if (bytes.length > MAX_HIGHLIGHT) return { ...meta, lines, kind: 'plain' as const, text };
	return { ...meta, lines, kind: 'code' as const, html: await highlight(text, name) };
}
