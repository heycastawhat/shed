import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { api, request } from '#lib/server/forgejo.js';

type Detail = {
	type: string;
	name: string;
	private: boolean;
	can_write: boolean;
	versions: { version: string; digest: string; size: number; created_at: string; by: { login: string } | null }[];
};

export async function load({ locals, params }) {
	return { owner: params.owner, pkg: await api<Detail>(locals.token, `/packages/${params.owner}/${params.type}/${params.name}`) };
}

const call = async (token: string | undefined, path: string, init: RequestInit) => {
	try {
		await request(token, path, init);
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { error: e.body.message });
		throw e;
	}
};

export const actions = {
	visibility: async ({ locals, params, request: req }) =>
		call(locals.token, `/packages/${params.owner}/${params.type}/${params.name}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ private: (await req.formData()).get('private') === '1' })
		}),
	deleteVersion: async ({ locals, params, request: req }) =>
		call(locals.token, `/packages/${params.owner}/${params.type}/${params.name}?version=${encodeURIComponent(String((await req.formData()).get('version')))}`, { method: 'DELETE' }),
	delete: async ({ locals, params }) => {
		const r = await call(locals.token, `/packages/${params.owner}/${params.type}/${params.name}`, { method: 'DELETE' });
		if (r) return r;
		redirect(303, `/${params.owner}/-/packages`);
	}
};
