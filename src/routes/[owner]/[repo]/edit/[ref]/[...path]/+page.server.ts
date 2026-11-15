import { blobUrl, b64, commitFromForm, editable, editableText } from '#lib/server/edit.js';

export async function load({ locals, params }) {
	const { dir, head } = await editable(locals, params);
	return await editableText(dir, head, params.path);
}

export const actions = {
	default: async ({ locals, params, request }) => {
		const form = await request.formData();
		const path = String(form.get('path') ?? '').trim().replace(/^\/+/, '');
		const op = { operation: 'update' as const, path, content: b64(String(form.get('content') ?? '').replace(/\r\n/g, '\n')), sha: String(form.get('sha') ?? '') || undefined };
		const files = [path === params.path ? op : { ...op, from_path: params.path }];
		return commitFromForm(locals, params, form, files, (b) => blobUrl(`${params.owner}/${params.repo}`, b, path));
	}
};
