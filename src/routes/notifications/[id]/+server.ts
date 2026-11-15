import { redirect } from '@sveltejs/kit';
import { api, request } from '#lib/server/forgejo.js';

// Opening a notification marks it read (a pinned one stays pinned), then goes to its issue or PR.
export async function GET({ locals, params }) {
	if (!locals.user) redirect(303, '/login');
	const path = `/notifications/threads/${Number(params.id) || 0}`;
	const n = await api<{ unread: boolean; pinned: boolean; subject: { html_url: string } }>(locals.token, path);
	if (n.unread) {
		await request(locals.token, `${path}?to-status=read`, { method: 'PATCH' });
		// Forgejo's statuses are exclusive, so marking read unpins; pin it back.
		if (n.pinned) await request(locals.token, `${path}?to-status=pinned`, { method: 'PATCH' });
	}
	redirect(303, new URL(n.subject.html_url, 'http://x').pathname);
}
