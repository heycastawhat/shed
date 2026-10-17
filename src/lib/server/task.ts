import { fail, isHttpError } from '@sveltejs/kit';
import { api, renderMarkdown, type User } from './forgejo.js';
import { dispatch, hostFor, projection, type Host, type Question } from './t3.js';

// One task's log and open requests, for TaskView. `repo` gives markdown links their context.
export async function taskDetail(token: string | undefined, host: Host, threadId: string, repo: string) {
	const proj = await projection(host, threadId);
	const items = await Promise.all(
		proj.visibleTurnItems.map(async ({ item }) => ({
			...item,
			html: item.type === 'assistant_message' && item.text ? await renderMarkdown(token, item.text, repo) : ''
		}))
	);
	const pending = proj.runtimeRequests
		.filter((r) => r.status === 'pending')
		.map((r) => ({ ...r, questions: items.find((i) => i.type === 'user_input_request' && i.requestId === r.id)?.questions ?? null }));
	return { items, pending };
}

const host = async (token: string | undefined, form: FormData) => hostFor((await api<User>(token, '/user')).id, form.get('host'));

// Runs a command for a button; T3 refusing it (say, the run ended meanwhile) shows next to the task instead of an error page.
async function send(token: string | undefined, form: FormData, command: Record<string, unknown>) {
	try {
		await dispatch(await host(token, form), command);
	} catch (e) {
		if (!isHttpError(e)) throw e;
		if (command.type === 'run.interrupt' && /not interruptible/.test(e.body.message)) return;
		return fail(e.status, { actionError: e.body.message });
	}
}

type Event = { locals: { token?: string }; request: Request };

// The form actions TaskView posts to; every page that shows a task spreads these into its actions.
export const taskActions = {
	answer: async ({ locals, request }: Event) => {
		const form = await request.formData();
		const questions: Question[] = JSON.parse(String(form.get('questions')));
		const answers = Object.fromEntries(
			questions.map((q) => {
				const other = String(form.get(`other:${q.id}`) ?? '').trim();
				const picked = form.getAll(`q:${q.id}`).map(String);
				return [q.id, other ? (q.multiSelect ? [...picked, other] : other) : q.multiSelect ? picked : (picked[0] ?? '')];
			})
		);
		const threadId = form.get('thread');
		const requestId = form.get('request');
		if (form.get('dismiss')) return send(locals.token, form, { type: 'thread.user-input.dismiss', threadId, requestId });
		if (Object.values(answers).some((a) => !a.length)) return fail(400, { answerError: 'Answer every question, or dismiss them' });
		return send(locals.token, form, { type: 'runtime-request.respond', threadId, requestId, answers });
	},
	respond: async ({ locals, request }: Event) => {
		const form = await request.formData();
		return send(locals.token, form, { type: 'runtime-request.respond', threadId: form.get('thread'), requestId: form.get('request'), decision: form.get('decision') });
	},
	steer: async ({ locals, request }: Event) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '').trim();
		if (!text) return fail(400, { actionError: 'Message is empty' });
		const run = form.get('run');
		return send(locals.token, form, {
			type: 'message.dispatch',
			createdBy: 'user',
			creationSource: 'web',
			threadId: form.get('thread'),
			messageId: crypto.randomUUID(),
			text,
			attachments: [],
			dispatchMode: run ? { type: 'steer_active', targetRunId: run } : { type: 'start_immediately' }
		});
	},
	stop: async ({ locals, request }: Event) => {
		const form = await request.formData();
		return send(locals.token, form, { type: 'run.interrupt', threadId: form.get('thread'), runId: form.get('run') });
	}
};
