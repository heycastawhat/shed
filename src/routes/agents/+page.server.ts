import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { agentsOverview, decide, dismissTask, launchFromForm, respondToTask } from '#lib/server/agentsview.js';
import { api, type User } from '#lib/server/forgejo.js';

export async function load({ locals }) {
	if (!locals.token) redirect(303, '/login');
	return agentsOverview(locals.token);
}

export const actions = {
	dismiss: async ({ locals, request }) => {
		const form = await request.formData();
		const me = await api<User>(locals.token, '/user');
		await dismissTask(me.id, String(form.get('host')), String(form.get('thread')), String(form.get('updatedAt')));
	},
	launch: async ({ locals, request }) => {
		const form = await request.formData();
		const repo = String(form.get('repo'));
		let to: string;
		try {
			to = await launchFromForm(locals.token, repo, form);
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { launchError: e.body.message });
			throw e;
		}
		redirect(303, `/${repo}/${to}`);
	},
	approve: ({ locals, request }) => resolve(locals.token, request, true),
	deny: ({ locals, request }) => resolve(locals.token, request, false),
	respond: async ({ locals, request }) => {
		const form = await request.formData();
		try {
			await respondToTask((await api<User>(locals.token, '/user')).id, form.get('host'), form.get('thread'), form.get('request'), form.get('decision'));
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
	}
};

async function resolve(token: string | undefined, request: Request, approve: boolean) {
	if (!token) redirect(303, '/login');
	const me = await api<User>(token, '/user');
	try {
		await decide(me.id, String((await request.formData()).get('id')), approve);
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
}
