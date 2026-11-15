import { error } from '@sveltejs/kit';
import { repoFor } from '#lib/server/shedrepo.js';
import { wikiDir } from '#lib/server/wiki.js';
import { gitBytes } from '#lib/server/git.js';

// Images and files stored in the wiki repo, with the same untrusted-content headers as /raw.
export async function GET({ locals, params }) {
	const { dir } = repoFor(locals, params.owner, params.repo);
	if (/(^|\/)\.\.?(\/|$)/.test(params.path)) error(400, 'Invalid path');
	const bytes = await gitBytes(wikiDir(dir), ['cat-file', 'blob', `refs/heads/main:${params.path}`]).catch(() => error(404, 'File not found'));
	const type = Bun.file(params.path).type.replace(/;.*/, '') || 'application/octet-stream';
	return new Response(bytes, {
		headers: {
			'content-type': /html|javascript|ecmascript/.test(type) ? 'text/plain; charset=utf-8' : type,
			'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
			'x-content-type-options': 'nosniff',
			...(/svg|xml/.test(type) && { 'content-disposition': 'attachment' })
		}
	});
}
