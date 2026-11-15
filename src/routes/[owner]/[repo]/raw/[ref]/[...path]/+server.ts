import { error } from '@sveltejs/kit';
import { blobSize, objectType, resolve, streamBlob } from '#lib/server/browse.js';
import { repoFor } from '#lib/server/shedrepo.js';

export async function GET({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha || (await objectType(dir, sha, params.path)) !== 'blob') error(404, 'File not found');
	const name = params.path.split('/').pop()!;
	const type = Bun.file(name).type.replace(/;.*/, '') || 'application/octet-stream';
	// Repo content is untrusted: never let it run as a page on our origin. The sandbox CSP already gives it an opaque origin;
	// SVG and XML can also carry script, so opening one downloads it (an <img> still renders it, since that ignores the disposition).
	const active = /svg|xml/.test(type);
	const text = type.startsWith('text/') || /json|javascript|ecmascript/.test(type);
	return new Response(streamBlob(dir, sha, params.path), {
		headers: {
			'content-type': /html|javascript|ecmascript/.test(type) ? 'text/plain; charset=utf-8' : text ? `${type}; charset=utf-8` : type,
			'content-length': String(await blobSize(dir, sha, params.path)),
			'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
			'x-content-type-options': 'nosniff',
			'cache-control': /^[0-9a-f]{40}$/.test(params.ref) ? 'private, max-age=31536000, immutable' : 'private, no-cache',
			...(active && { 'content-disposition': `attachment; filename="${encodeURIComponent(name)}"` })
		}
	});
}
