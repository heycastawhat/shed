import { error } from '@sveltejs/kit';
import { request } from '#lib/server/forgejo.js';

export async function GET({ locals, request: incoming }) {
	if (!locals.user) error(401, 'Sign in required');
	return request(locals.token, '/notifications/stream', { signal: incoming.signal });
}
