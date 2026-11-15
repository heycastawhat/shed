import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { request } from './forgejo.js';

// Creating and editing releases, shared by the new and edit pages.

type Where = { locals: { token?: string }; params: { owner: string; repo: string; id?: string }; request: Request };
export type Release = {
	id: number;
	tag_name: string;
	target_commitish: string;
	name: string;
	body: string;
	draft: boolean;
	prerelease: boolean;
	assets: { id: number; name: string; size: number; download_count: number; browser_download_url: string }[];
};

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function fields(form: FormData) {
	return {
		tag_name: String(form.get('tag') ?? '').trim(),
		target_commitish: String(form.get('target') ?? '') || undefined,
		name: String(form.get('name') ?? '').trim(),
		body: String(form.get('body') ?? ''),
		draft: form.has('draft'),
		prerelease: form.has('prerelease')
	};
}

async function upload(token: string | undefined, base: string, id: number, form: FormData) {
	for (const f of form.getAll('files'))
		if (f instanceof File && f.size) {
			const body = new FormData();
			body.set('attachment', f);
			await request(token, `${base}/releases/${id}/assets`, { method: 'POST', body });
		}
}

async function attempt(action: string, fn: () => Promise<void>) {
	try {
		await fn();
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { action, error: e.body.message });
		throw e;
	}
}

export const releaseActions = {
	save: async ({ locals, params, request: req }: Where) => {
		const base = `/repos/${params.owner}/${params.repo}`;
		const form = await req.formData();
		const f = fields(form);
		if (!f.tag_name) return fail(400, { action: 'save', error: 'Pick or name a tag' });
		const failed = await attempt('save', async () => {
			const r = params.id
				? await request(locals.token, `${base}/releases/${Number(params.id)}`, json('PATCH', f))
				: await request(locals.token, `${base}/releases`, json('POST', f));
			await upload(locals.token, base, ((await r.json()) as Release).id, form);
		});
		if (failed) return failed;
		redirect(303, `/${params.owner}/${params.repo}/releases`);
	},
	delete: async ({ locals, params }: Where) => {
		const failed = await attempt('delete', async () => void (await request(locals.token, `/repos/${params.owner}/${params.repo}/releases/${Number(params.id)}`, { method: 'DELETE' })));
		if (failed) return failed;
		redirect(303, `/${params.owner}/${params.repo}/releases`);
	},
	deleteAsset: async ({ locals, params, request: req }: Where) => {
		const asset = Number((await req.formData()).get('asset'));
		return attempt('asset', async () => void (await request(locals.token, `/repos/${params.owner}/${params.repo}/releases/${Number(params.id)}/assets/${asset}`, { method: 'DELETE' })));
	}
};
