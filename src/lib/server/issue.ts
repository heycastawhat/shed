import { fail, isHttpError } from '@sveltejs/kit';
import { unsign } from '#lib/sign.js';
import { api, request, type Issue, type Label, type Milestone, type User } from './forgejo.js';

type Event = { locals: { token?: string }; params: { owner: string; repo: string; index: string }; request: Request };

export async function send(action: string, token: string | undefined, path: string, method: string, body?: unknown) {
	try {
		await request(token, path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { action, error: e.body.message });
		throw e;
	}
}

// PRs share issue numbers, so the issue endpoints serve both the issue and the PR page.
export const issueActions = {
	label: async ({ locals, params, request: req }: Event) => {
		const form = await req.formData();
		const path = `/repos/${params.owner}/${params.repo}/issues/${params.index}/labels`;
		const id = Number(form.get('id'));
		return form.has('remove') ? send('label', locals.token, `${path}/${id}`, 'DELETE') : send('label', locals.token, path, 'POST', { labels: [id] });
	},
	// Toggles one user against the current list, so quick clicks on a stale page don't undo each other.
	assign: async ({ locals, params, request: req }: Event) => {
		const form = await req.formData();
		const login = String(form.get('login'));
		const path = `/repos/${params.owner}/${params.repo}/issues/${params.index}`;
		const current = ((await api<Issue>(locals.token, path)).assignees ?? []).map((a) => a.login).filter((a) => a !== login);
		return send('assign', locals.token, path, 'PATCH', { assignees: form.has('remove') ? current : [...current, login] });
	},
	milestone: async ({ locals, params, request: req }: Event) => {
		const milestone = Number((await req.formData()).get('id'));
		return send('milestone', locals.token, `/repos/${params.owner}/${params.repo}/issues/${params.index}`, 'PATCH', { milestone });
	},
	edit: async ({ locals, params, request: req }: Event) => {
		const form = await req.formData();
		const path = `/repos/${params.owner}/${params.repo}/issues/${params.index}`;
		if (form.has('title')) {
			const title = String(form.get('title')).trim();
			return title ? send('title', locals.token, path, 'PATCH', { title }) : fail(400, { action: 'title', error: 'Title is empty' });
		}
		// The editor shows the body without forge's agent signature; put the original one back so the attribution survives the edit.
		const { body: old } = await api<Issue>(locals.token, path);
		const footer = old.slice(unsign(old).body.length);
		return send('body', locals.token, path, 'PATCH', { body: String(form.get('body') ?? '').trimEnd() + footer });
	}
};

// What the sidebar pickers offer: every label, the users who can be assigned, and the open milestones.
export async function triageOptions(token: string | undefined, repo: string) {
	const [labels, assignees, milestones] = await Promise.all([
		api<Label[]>(token, `/repos/${repo}/labels?limit=100`),
		api<User[]>(token, `/repos/${repo}/assignees`),
		api<Milestone[]>(token, `/repos/${repo}/milestones?state=open&limit=100`)
	]);
	return { labels, assignees, milestones };
}

export const PAGE_SIZE = 25;

export async function listFilters(token: string | undefined, repo: string, url: URL) {
	const get = (k: string) => url.searchParams.get(k) || null;
	const [labels, milestones] = await Promise.all([api<Label[]>(token, `/repos/${repo}/labels?limit=100`), api<Milestone[]>(token, `/repos/${repo}/milestones?state=all&limit=100`)]);
	const label = get('labels');
	const milestone = get('milestone');
	return {
		state: get('state') === 'closed' ? 'closed' : 'open',
		label,
		milestone,
		assignee: get('assignee'),
		page: Math.max(1, Number(get('page')) || 1),
		labels,
		milestones,
		labelId: labels.find((l) => l.name === label)?.id,
		milestoneId: milestones.find((m) => m.title === milestone)?.id,
		// Forgejo ignores an unknown label or milestone and returns everything, so the list has to be emptied by hand.
		unknown: (!!label && !labels.some((l) => l.name === label)) || (!!milestone && !milestones.some((m) => m.title === milestone))
	};
}
