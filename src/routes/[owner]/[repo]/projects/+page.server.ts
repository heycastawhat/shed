import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { createProject, listProjects } from '#lib/server/projects.js';
import { db } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';

export function load({ locals, params }) {
	const { row } = repoFor(locals, params.owner, params.repo);
	return { projects: listProjects(db, row.id) };
}

export const actions = {
	create: async ({ locals, params, request }) => {
		const { row } = repoFor(locals, params.owner, params.repo, 'write');
		const form = await request.formData();
		let id: number;
		try {
			id = createProject(db, row.id, String(form.get('title') ?? ''), String(form.get('description') ?? ''));
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message });
			throw e;
		}
		redirect(303, `/${params.owner}/${params.repo}/projects/${id}`);
	}
};
