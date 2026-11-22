import { redirect } from '@sveltejs/kit';
import { apiPage } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';

export type Note = {
	id: number;
	unread: boolean;
	pinned: boolean;
	updated_at: string;
	repository: { full_name: string };
	subject: { title: string; type: 'Issue' | 'Pull'; state: string; url: string; html_url: string };
};

export async function load({ locals, url, depends, setHeaders }) {
	depends('shed:notifications');
	if (!locals.user) redirect(303, '/login');
	// With bfcache off, Back can otherwise replay stale unread state from the HTTP cache.
	setHeaders({ 'cache-control': 'private, no-store' });
	const all = url.searchParams.get('tab') === 'all';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const { items, total } = await apiPage<Note>(locals.token, `/notifications?${all ? 'all=true&' : ''}limit=50&page=${page}`);
	const groups = new Map<string, (Note & { number: number })[]>();
	// Pinned ones first, then newest first within each repo.
	for (const n of [...items].sort((a, b) => +b.pinned - +a.pinned))
		(groups.get(n.repository.full_name) ?? groups.set(n.repository.full_name, []).get(n.repository.full_name)!).push({ ...n, number: Number(n.subject.url.split('/').pop()) });
	return { all, page, total, groups: [...groups].map(([repo, notes]) => ({ repo, notes })) };
}

const thread = (token: string | undefined, id: unknown, to: string) => send('note', token, `/notifications/threads/${Number(id)}?to-status=${to}`, 'PATCH');

export const actions = {
	mark: async ({ locals, request }) => {
		const form = await request.formData();
		return thread(locals.token, form.get('id'), String(form.get('to')) === 'unread' ? 'unread' : String(form.get('to')) === 'pinned' ? 'pinned' : 'read');
	},
	all: async ({ locals }) => send('note', locals.token, '/notifications', 'PUT')
};
