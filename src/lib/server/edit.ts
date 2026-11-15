import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { blobSize, objectType, readBlob, resolve } from './browse.js';
import type { FileOp } from './files.js';
import { request } from './forgejo.js';
import { git } from './git.js';
import { repoFor } from './shedrepo.js';
import { refPath } from '#lib/repo.js';

// Editing pages only work on a branch the person can push to (a tag or commit has nowhere to commit to).
export async function editable(locals: App.Locals, params: { owner: string; repo: string; ref: string }) {
	const { dir } = repoFor(locals, params.owner, params.repo, 'write');
	const head = await resolve(dir, `refs/heads/${params.ref}`);
	if (!head) error(404, `${params.ref} isn't a branch, so there's nothing to commit to`);
	return { dir, head };
}

// The text of a file for the editor, or an error page if it isn't editable text.
export async function editableText(dir: string, head: string, path: string) {
	if ((await objectType(dir, head, path)) !== 'blob') error(404, `${path} doesn't exist`);
	if ((await blobSize(dir, head, path)) > 1024 * 1024) error(422, `${path} is too large to edit in the browser`);
	const bytes = await readBlob(dir, head, path);
	if (bytes.subarray(0, 8000).includes(0)) error(422, `${path} is a binary file`);
	return { text: new TextDecoder().decode(bytes), sha: (await git(dir, ['rev-parse', `${head}:${path}`])).trim() };
}

export const b64 = (s: string) => new TextEncoder().encode(s).toBase64();

// Commits `files` from a CommitBox form: to the current branch, or to a new one (then optionally on to the compare page to open a PR).
// `then` gives the page to land on for the branch the commit went to.
export async function commitFromForm(locals: App.Locals, params: { owner: string; repo: string; ref: string }, form: FormData, files: FileOp[], then: (branch: string) => string | Promise<string>) {
	const repo = `${params.owner}/${params.repo}`;
	const newBranch = form.get('target') === 'new' ? String(form.get('new_branch') ?? '').trim() : '';
	if (form.get('target') === 'new' && !newBranch) return fail(400, { error: 'Name the new branch' });
	try {
		await request(locals.token, `/repos/${repo}/contents`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ branch: params.ref, new_branch: newBranch || undefined, message: String(form.get('message') ?? ''), files })
		});
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
	if (newBranch && form.get('pr')) redirect(303, `/${repo}/compare/${encodeURIComponent(params.ref)}...${encodeURIComponent(newBranch)}`);
	redirect(303, await then(newBranch || params.ref));
}

export const blobUrl = (repo: string, ref: string, path: string) => `/${repo}/blob/${refPath(ref, path)}`;
export const treeUrl = (repo: string, ref: string, path: string) => `/${repo}/tree/${refPath(ref, path)}`;
