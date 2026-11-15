import type { Database } from 'bun:sqlite';
import { error, isHttpError } from '@sveltejs/kit';
import type { TokenAuth, UserRow } from '../accounts.js';

// A Forgejo-compatible REST API (the /api/v1 subset Shed's own pages and agents use, plus what common tools call). Pages call it
// in-process through forgejo.ts; other clients reach it over HTTP at /api/v1 with a Shed token.

export type Ctx = {
	db: Database;
	root: string;
	origin: string;
	user: UserRow | null;
	// Set for personal tokens; in-process calls act with the person's full access.
	token: TokenAuth | null;
	method: string;
	url: URL;
	params: Record<string, string>;
	request: Request;
	body: <T = Record<string, unknown>>() => Promise<T>;
};
type Handler = (c: Ctx) => unknown;

// Returned by handlers that page: the array is the body, the total goes in x-total-count, as Forgejo does.
export class Paged<T> {
	constructor(
		readonly items: T[],
		readonly total: number
	) {}
}

const routes: { method: string; re: RegExp; keys: string[]; handler: Handler; weight: number }[] = [];

// Patterns use :name for one segment and *name for the rest of the path.
export function route(method: string, pattern: string, handler: Handler) {
	const keys: string[] = [];
	const re = new RegExp(
		'^' +
			pattern.replace(/[:*](\w+)/g, (m, k) => {
				keys.push(k);
				return m[0] === '*' ? '(.+)' : '([^/]+)';
			}) +
			'$'
	);
	// When several patterns match, the most literal wins (/repos/issues/search over /repos/:owner/:repo; a *rest loses to anything).
	const weight = pattern.replace(/:\w+/g, '').length - (pattern.includes('*') ? 1000 : 0);
	routes.push({ method, re, keys, handler, weight });
	routes.sort((a, b) => b.weight - a.weight);
}

export const me = (c: Ctx) => c.user ?? error(401, 'Sign in first');

export const page = (c: Ctx, def = 30) => {
	const limit = Math.min(100, Math.max(1, Number(c.url.searchParams.get('limit')) || def));
	const p = Math.max(1, Number(c.url.searchParams.get('page')) || 1);
	return { limit, page: p, offset: (p - 1) * limit };
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export async function dispatch(db: Database, root: string, origin: string, request: Request, auth: { user: UserRow | null; token: TokenAuth | null }) {
	const url = new URL(request.url);
	const path = url.pathname.replace(/^\/api\/v1/, '');
	// The same `..` guard forgejo.ts had: nothing a URL carries may step outside its repo.
	if (path.split(/[/\\]/).some((s) => /^(\.|%2e){1,2}$/i.test(s))) return json(400, { message: 'Invalid path' });
	let allowed = false;
	for (const r of routes) {
		const m = path.match(r.re);
		if (!m) continue;
		allowed = true;
		if (r.method !== request.method) continue;
		const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
		let cached: unknown;
		const c: Ctx = {
			db,
			root,
			origin,
			...auth,
			method: request.method,
			url,
			params,
			request,
			body: async <T>() => (cached ??= await request.json().catch(() => ({}))) as T
		};
		try {
			const out = await r.handler(c);
			if (out instanceof Response) return out;
			if (out instanceof Paged) return json(200, out.items, { 'x-total-count': String(out.total), 'access-control-expose-headers': 'X-Total-Count' });
			if (out === undefined) return new Response(null, { status: 204 });
			return json(request.method === 'POST' && !path.endsWith('/merge') && !path.startsWith('/markdown') ? 201 : 200, out);
		} catch (e) {
			if (isHttpError(e)) return json(e.status, { message: e.body.message });
			console.error('api', request.method, path, e);
			return json(500, { message: 'Internal error' });
		}
	}
	return json(allowed ? 405 : 404, { message: allowed ? 'Method not allowed' : `No API route for ${path}` });
}
