import { encodePath, request } from '#lib/server/forgejo.js';

export async function GET({ locals, params }) {
	const res = await request(locals.token, `/repos/${params.owner}/${params.repo}/raw/${encodePath(params.path)}?ref=${encodeURIComponent(params.ref)}`);
	const type = res.headers.get('content-type') ?? 'application/octet-stream';
	// Repo content is untrusted: never let it run as a page on our origin.
	return new Response(res.body, {
		headers: {
			'content-type': /html|javascript/.test(type) ? 'text/plain; charset=utf-8' : type,
			'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
			'x-content-type-options': 'nosniff'
		}
	});
}
