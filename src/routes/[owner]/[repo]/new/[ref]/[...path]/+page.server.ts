import { error } from '@sveltejs/kit';
import { objectType } from '#lib/server/browse.js';
import { blobUrl, b64, commitFromForm, editable } from '#lib/server/edit.js';

// `path` is the folder the new file starts in.
export async function load({ locals, params }) {
	const { dir, head } = await editable(locals, params);
	if (params.path && (await objectType(dir, head, params.path)) !== 'tree') error(404, `${params.path} isn't a folder in ${params.ref}`);
	return {};
}

export const actions = {
	default: async ({ locals, params, request }) => {
		const form = await request.formData();
		const path = String(form.get('path') ?? '').trim().replace(/^\/+/, '');
		const files = [{ operation: 'create' as const, path, content: b64(String(form.get('content') ?? '').replace(/\r\n/g, '\n')) }];
		return commitFromForm(locals, params, form, files, (b) => blobUrl(`${params.owner}/${params.repo}`, b, path));
	}
};
