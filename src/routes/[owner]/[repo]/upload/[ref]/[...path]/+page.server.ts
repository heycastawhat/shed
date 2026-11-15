import { error, fail } from '@sveltejs/kit';
import { objectType } from '#lib/server/browse.js';
import { commitFromForm, editable, treeUrl } from '#lib/server/edit.js';

// Uploads go into the folder `path`, all in one commit; a file that's already there is replaced.
export async function load({ locals, params }) {
	const { dir, head } = await editable(locals, params);
	if (params.path && (await objectType(dir, head, params.path)) !== 'tree') error(404, `${params.path} isn't a folder in ${params.ref}`);
	return {};
}

export const actions = {
	default: async ({ locals, params, request }) => {
		const { dir, head } = await editable(locals, params);
		const form = await request.formData();
		const files = form.getAll('files').filter((f): f is File => f instanceof File && !!f.name);
		if (!files.length) return fail(400, { error: 'Choose some files first' });
		const ops = await Promise.all(
			files.map(async (f) => {
				const path = params.path ? `${params.path}/${f.name}` : f.name;
				return { operation: (await objectType(dir, head, path)) === 'blob' ? ('update' as const) : ('create' as const), path, content: (await f.bytes()).toBase64() };
			})
		);
		return commitFromForm(locals, params, form, ops, (b) => treeUrl(`${params.owner}/${params.repo}`, b, params.path));
	}
};
