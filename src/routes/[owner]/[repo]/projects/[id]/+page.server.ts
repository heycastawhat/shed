import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { addCard, addColumn, board, deleteCard, deleteColumn, getProject, moveCard, renameColumn } from '#lib/server/projects.js';
import { db } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';

export function load({ locals, params }) {
	const { row } = repoFor(locals, params.owner, params.repo);
	const project = getProject(db, row.id, Number(params.id));
	return { project, columns: board(db, project.id) };
}

// Every change needs write access and goes through one place that turns refusals into form errors.
function act(fn: (repoId: number, projectId: number, form: FormData) => void) {
	return async ({ locals, params, request }: { locals: App.Locals; params: { owner: string; repo: string; id: string }; request: Request }) => {
		const { row } = repoFor(locals, params.owner, params.repo, 'write');
		const project = getProject(db, row.id, Number(params.id));
		try {
			fn(row.id, project.id, await request.formData());
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
	};
}
const num = (f: FormData, k: string) => Number(f.get(k));

export const actions = {
	addCard: act((repo, p, f) => addCard(db, repo, p, num(f, 'column'), String(f.get('text') ?? ''))),
	move: act((_, p, f) => moveCard(db, p, num(f, 'card'), num(f, 'column'), num(f, 'before') || undefined)),
	deleteCard: act((_, p, f) => deleteCard(db, p, num(f, 'card'))),
	addColumn: act((_, p, f) => addColumn(db, p, String(f.get('title') ?? ''))),
	renameColumn: act((_, p, f) => renameColumn(db, p, num(f, 'column'), String(f.get('title') ?? ''))),
	deleteColumn: act((_, p, f) => deleteColumn(db, p, num(f, 'column'))),
	edit: act((_, p, f) => {
		db.query('update projects set title = coalesce(nullif(?, \'\'), title), description = ?, state = ? where id = ?').run(
			String(f.get('title') ?? '').trim(),
			String(f.get('description') ?? ''),
			f.get('state') === 'closed' ? 'closed' : 'open',
			p
		);
	}),
	delete: async (event) => {
		const { row } = repoFor(event.locals, event.params.owner, event.params.repo, 'write');
		db.query('delete from projects where id = ? and repo_id = ?').run(Number(event.params.id), row.id);
		redirect(303, `/${event.params.owner}/${event.params.repo}/projects`);
	}
};
