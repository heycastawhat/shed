import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';

type Runner = { id: number; name: string; labels: string[]; version: string; scope: 'repo' | 'global'; last_online: string | null; online: boolean };

export async function load({ locals, params }) {
	const base = `/repos/${params.owner}/${params.repo}/actions`;
	const [secrets, variables, runners] = await Promise.all([
		api<{ name: string; created_at: string }[]>(locals.token, `${base}/secrets`),
		api<{ name: string; data: string }[]>(locals.token, `${base}/variables`),
		api<Runner[]>(locals.token, `${base}/runners`)
	]);
	return { secrets, variables, runners };
}

const base = (p: { owner: string; repo: string }) => `/repos/${p.owner}/${p.repo}/actions`;
const field = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export const actions = {
	secret: async ({ locals, params, request }) => {
		const f = await request.formData();
		const name = field(f, 'name');
		if (!name) return fail(422, { action: 'secret', error: 'Name the secret' });
		return (
			(await send('secret', locals.token, `${base(params)}/secrets/${encodeURIComponent(name)}`, 'PUT', { data: String(f.get('value') ?? '') })) ?? {
				action: 'secret',
				saved: name.toUpperCase()
			}
		);
	},
	deleteSecret: async ({ locals, params, request }) =>
		send('deleteSecret', locals.token, `${base(params)}/secrets/${encodeURIComponent(field(await request.formData(), 'name'))}`, 'DELETE'),
	variable: async ({ locals, params, request }) => {
		const f = await request.formData();
		const name = field(f, 'name');
		if (!name) return fail(422, { action: 'variable', error: 'Name the variable' });
		return (
			(await send('variable', locals.token, `${base(params)}/variables/${encodeURIComponent(name)}`, 'PUT', { value: String(f.get('value') ?? '') })) ?? {
				action: 'variable',
				saved: name.toUpperCase()
			}
		);
	},
	deleteVariable: async ({ locals, params, request }) =>
		send('deleteVariable', locals.token, `${base(params)}/variables/${encodeURIComponent(field(await request.formData(), 'name'))}`, 'DELETE'),
	deleteRunner: async ({ locals, params, request }) => send('deleteRunner', locals.token, `${base(params)}/runners/${Number(field(await request.formData(), 'id'))}`, 'DELETE'),
	register: async ({ locals, params, request, url }) => {
		const f = await request.formData();
		const name = field(f, 'name') || `${params.repo}-runner`;
		const labels = field(f, 'labels') || 'host';
		try {
			const { token } = await api<{ token: string }>(locals.token, `${base(params)}/runners/registration-token`);
			const q = (s: string) => (/^[\w.,:/@=+-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);
			return { action: 'register', command: `forgejo-runner register --no-interactive --instance ${url.origin} --token ${token} --name ${q(name)} --labels ${q(labels)}` };
		} catch (e) {
			return fail(502, { action: 'register', error: e instanceof Error ? e.message : 'Could not get a registration token' });
		}
	}
};
