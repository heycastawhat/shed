import { api, type Repo, type User } from '#lib/server/forgejo.js';

type Found<T> = { data: T[]; total?: number };

export async function load({ locals, url }) {
	const tab = (['users', 'orgs'] as const).find((t) => t === url.searchParams.get('tab')) ?? 'repos';
	const q = url.searchParams.get('q') ?? '';
	const query = new URLSearchParams({ q, limit: '50' });
	if (tab === 'repos') return { tab, q, repos: (await api<Found<Repo>>(locals.token, `/repos/search?${query}`)).data, people: [] };
	query.set('kind', tab === 'orgs' ? 'org' : 'user');
	return { tab, q, repos: [], people: (await api<Found<User & { kind: string }>>(locals.token, `/users/search?${query}`)).data };
}
