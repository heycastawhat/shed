import { api } from '#lib/server/forgejo.js';

type Pkg = { id: number; type: string; name: string; private: boolean; updated_at: string };

export async function load({ locals, params }) {
	return { owner: params.owner, packages: await api<Pkg[]>(locals.token, `/packages/${params.owner}`) };
}
