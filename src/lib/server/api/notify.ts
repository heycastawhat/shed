import { error } from '@sveltejs/kit';
import { access, atLeast } from '../access.js';
import { mentions } from '../markdown.js';
import type { RepoRow } from '../repos.js';
import { bool, now, type RepoCtx } from './common.js';
import { mailEnabled, sendMail } from '../mail.js';
import { me, page, Paged, route, type Ctx } from './router.js';
import type { IssueRow } from './shapes.js';

// Who hears about activity on an issue or PR: its subscribers (author, commenters, assignees), people watching the repo, and anyone
// @mentioned who can read it. Never the person who did it.
export function notify(c: Ctx, r: RepoCtx, i: IssueRow, what: string, text: string) {
	const actor = c.user?.id;
	const ids = new Set<number>();
	for (const s of c.db.query<{ user_id: number; subscribed: number }, [number]>('select user_id, subscribed from subscriptions where issue_id = ?').all(i.id)) if (s.subscribed) ids.add(s.user_id);
	for (const w of c.db.query<{ user_id: number }, [number]>('select user_id from watches where repo_id = ?').all(r.row.id)) ids.add(w.user_id);
	const muted = new Set(c.db.query<{ user_id: number }, [number]>('select user_id from subscriptions where issue_id = ? and subscribed = 0').all(i.id).map((x) => x.user_id));
	for (const login of mentions(text)) {
		const u = c.db.query<{ id: number }, [string]>("select id from users where login = ? and kind = 'user'").get(login);
		if (u && atLeast(access(c.db, u.id, r.row), 'read')) ids.add(u.id), muted.delete(u.id);
	}
	for (const id of ids) {
		if (id === actor || muted.has(id)) continue;
		addNotification(c, id, i, r.row.id, what, text);
		if (mailEnabled()) {
			const u = c.db.query<{ email: string | null; notify_email: number }, [number]>('select email, notify_email from users where id = ?').get(id);
			if (u?.email && u.notify_email) {
				const kind = i.is_pull ? 'pulls' : 'issues';
				const link = `${c.origin}/${r.full}/${kind}/${i.number}`;
				// Threading headers keep one conversation per issue in mail clients.
				const thread = `<${r.full}/${kind}/${i.number}@shed>`;
				sendMail(u.email, `[${r.full}] ${i.title} (#${i.number})`, `${c.user?.login ?? 'Someone'} ${what}.\n\n${text.trim()}${text.trim() ? '\n\n' : ''}${link}\n\nTurn these emails off in Settings → Account.`, {
					'In-Reply-To': thread,
					References: thread
				});
			}
		}
	}
}

// Open /notifications/stream connections, by user. Each new or renewed notification is pushed to them as it's written.
const listeners = new Map<number, Set<(n: object) => void>>();

export function listen(userId: number, fn: (n: object) => void) {
	const set = listeners.get(userId) ?? new Set();
	listeners.set(userId, set.add(fn));
	return () => {
		set.delete(fn);
		if (!set.size) listeners.delete(userId);
	};
}

export function addNotification(c: Ctx, userId: number, i: IssueRow, repoId: number, what: string, text = '') {
	c.db
		.query("insert into notifications (user_id, issue_id, repo_id, unread, updated_at) values (?, ?, ?, 1, ?) on conflict (user_id, issue_id) do update set unread = 1, updated_at = excluded.updated_at")
		.run(userId, i.id, repoId, now());
	const subs = listeners.get(userId);
	if (!subs?.size) return;
	const n = c.db.query<Row, [number, number]>('select * from notifications where user_id = ? and issue_id = ?').get(userId, i.id)!;
	const event = { ...json(c, n), number: i.number, actor: c.user?.login ?? null, what, text: text.trim().slice(0, 300) };
	for (const fn of subs) fn(event);
}

type Row = { id: number; issue_id: number; repo_id: number; unread: number; pinned: number; updated_at: string };

function json(c: Ctx, n: Row) {
	const i = c.db.query<IssueRow, [number]>('select * from issues where id = ?').get(n.issue_id)!;
	const repo = c.db.query<RepoRow, [number]>('select r.*, u.login as owner from repos r join users u on u.id = r.owner_id where r.id = ?').get(n.repo_id)!;
	const full = `${repo.owner}/${repo.name}`;
	const merged = i.is_pull ? c.db.query<{ m: string | null }, [number]>('select merged_at as m from pulls where issue_id = ?').get(i.id)?.m : null;
	return {
		id: n.id,
		unread: !!n.unread,
		pinned: !!n.pinned,
		updated_at: n.updated_at,
		repository: { id: repo.id, name: repo.name, full_name: full, owner: { login: repo.owner } },
		subject: {
			title: i.title,
			type: i.is_pull ? 'Pull' : 'Issue',
			state: merged ? 'merged' : i.state,
			url: `${c.origin}/api/v1/repos/${full}/issues/${i.number}`,
			html_url: `${c.origin}/${full}/${i.is_pull ? 'pulls' : 'issues'}/${i.number}`,
			latest_comment_html_url: ''
		},
		url: `${c.origin}/api/v1/notifications/threads/${n.id}`
	};
}

route('GET', '/notifications', (c) => {
	const u = me(c);
	const q = c.url.searchParams;
	const types = q.getAll('status-types').flatMap((s) => s.split(','));
	const want = types.length ? types : bool(q.get('all')) ? ['read', 'unread', 'pinned'] : ['unread', 'pinned'];
	const rows = c.db
		.query<Row, [number]>('select * from notifications where user_id = ? order by updated_at desc')
		.all(u.id)
		.filter((n) => (n.unread && want.includes('unread')) || (!n.unread && want.includes('read')) || (n.pinned && want.includes('pinned')));
	const p = page(c);
	return new Paged(rows.slice(p.offset, p.offset + p.limit).map((n) => json(c, n)), rows.length);
});
// Server-sent events: one `notification` event per new or renewed notification (the usual JSON plus number, actor, what and text),
// and a comment line every 20 s so proxies and the Cloudflare tunnel keep the connection open. Clients catch up with GET /notifications.
route('GET', '/notifications/stream', (c) => {
	const u = me(c);
	const enc = new TextEncoder();
	let stop = () => {};
	const body = new ReadableStream<Uint8Array>({
		start(ctl) {
			const send = (s: string) => {
				try {
					ctl.enqueue(enc.encode(s));
				} catch {
					stop();
				}
			};
			const off = listen(u.id, (n) => send(`event: notification\ndata: ${JSON.stringify(n)}\n\n`));
			const ping = setInterval(() => send(': ping\n\n'), 20_000);
			stop = () => (off(), clearInterval(ping));
			c.request.signal.addEventListener('abort', stop);
			send('retry: 5000\nevent: ready\ndata: {}\n\n');
		},
		cancel: () => stop()
	});
	return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' } });
});
route('GET', '/notifications/new', (c) => ({ new: c.db.query<{ n: number }, [number]>('select count(*) as n from notifications where user_id = ? and unread = 1').get(me(c).id)!.n }));
route('GET', '/notifications/threads/:id', (c) =>
	json(c, c.db.query<Row, [number, number]>('select * from notifications where id = ? and user_id = ?').get(Number(c.params.id), me(c).id) ?? error(404, 'Notification not found'))
);
route('PATCH', '/notifications/threads/:id', (c) => {
	const u = me(c);
	const to = c.url.searchParams.get('to-status') ?? 'read';
	const n = c.db.query<Row, [number, number]>('select * from notifications where id = ? and user_id = ?').get(Number(c.params.id), u.id) ?? error(404, 'Notification not found');
	if (to === 'pinned') c.db.query('update notifications set pinned = 1 where id = ?').run(n.id);
	else c.db.query('update notifications set unread = ?, pinned = 0 where id = ?').run(to === 'unread' ? 1 : 0, n.id);
	return json(c, c.db.query<Row, [number]>('select * from notifications where id = ?').get(n.id)!);
});
route('PUT', '/notifications', (c) => {
	c.db.query('update notifications set unread = 0 where user_id = ?').run(me(c).id);
	return [];
});
