import { error, redirect } from '@sveltejs/kit';
import { blobSize, objectType, readBlob, resolve } from '#lib/server/browse.js';
import { git } from '#lib/server/git.js';
import { commitFromForm, editable, treeUrl } from '#lib/server/edit.js';
import { highlightLines, languageFor } from '#lib/server/highlight.js';
import { render } from '#lib/server/markdown.js';
import { db } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i;
const MAX_HIGHLIGHT = 512 * 1024;
const MAX_SHOWN = 5 * 1024 * 1024;

export async function load({ locals, params, url }) {
	const repo = `${params.owner}/${params.repo}`;
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, params.ref);
	if (!sha) error(404, `No branch, tag or commit called ${params.ref}`);
	const type = await objectType(dir, sha, params.path);
	// Relative links in markdown can point at folders.
	if (type === 'tree') redirect(303, `/${repo}/tree/${encodeURIComponent(params.ref)}/${params.path}`);
	if (type !== 'blob') error(404, `${params.path} doesn't exist in ${params.ref}`);
	const name = params.path.split('/').pop()!;
	const size = await blobSize(dir, sha, params.path);
	const meta = { name, size, commit: sha, blob: (await git(dir, ['rev-parse', `${sha}:${params.path}`])).trim() };

	if (IMAGE.test(name)) return { ...meta, kind: 'image' as const };
	if (size > MAX_SHOWN) return { ...meta, kind: 'large' as const };

	const bytes = await readBlob(dir, sha, params.path);
	if (bytes.subarray(0, 8000).includes(0)) return { ...meta, kind: 'binary' as const };

	const text = new TextDecoder().decode(bytes);
	const lines = text.replace(/\n$/, '').split('\n');
	if (/\.(md|markdown)$/i.test(name) && !url.searchParams.has('plain'))
		return { ...meta, lines: lines.length, kind: 'markdown' as const, html: render(text, { repo, ref: params.ref, dir: params.path.split('/').slice(0, -1).join('/') }, db) };
	const html = await highlightLines(lines, bytes.length > MAX_HIGHLIGHT ? 'text' : languageFor(name));
	return { ...meta, lines: lines.length, kind: 'code' as const, html };
}

export const actions = {
	delete: async ({ locals, params, request }) => {
		const { dir } = await editable(locals, params);
		const form = await request.formData();
		// Deleting a folder's last file deletes the folder, so land on the nearest one that's left.
		const landing = async (branch: string) => {
			const head = (await resolve(dir, `refs/heads/${branch}`))!;
			let parent = params.path.split('/').slice(0, -1);
			while (parent.length && (await objectType(dir, head, parent.join('/'))) !== 'tree') parent = parent.slice(0, -1);
			return treeUrl(`${params.owner}/${params.repo}`, branch, parent.join('/'));
		};
		return commitFromForm(locals, params, form, [{ operation: 'delete', path: params.path, sha: String(form.get('sha') ?? '') || undefined }], landing);
	}
};
