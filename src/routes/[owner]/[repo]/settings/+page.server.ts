import { fail, redirect } from '@sveltejs/kit';
import { api, type Repo } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';

export async function load({ locals, params }) {
	return { settings: await api<Repo>(locals.token, `/repos/${params.owner}/${params.repo}`) };
}

const STYLES = {
	merge: 'allow_merge_commits',
	rebase: 'allow_rebase',
	'rebase-merge': 'allow_rebase_explicit',
	squash: 'allow_squash_merge',
	'fast-forward-only': 'allow_fast_forward_only_merge'
} as const;
const patch = (action: string, token: string | undefined, p: { owner: string; repo: string }, body: unknown) => send(action, token, `/repos/${p.owner}/${p.repo}`, 'PATCH', body);

export const actions = {
	general: async ({ locals, params, request }) => {
		const f = await request.formData();
		return (
			(await patch('general', locals.token, params, {
				description: String(f.get('description') ?? '').trim(),
				private: f.get('visibility') === 'private',
				default_branch: f.get('default_branch') ? String(f.get('default_branch')) : undefined,
				has_issues: f.has('has_issues'),
				has_wiki: f.has('has_wiki')
			})) ?? { action: 'general', saved: true }
		);
	},
	merge: async ({ locals, params, request }) => {
		const f = await request.formData();
		const allowed = f.getAll('style').map(String);
		const def = String(f.get('default_merge_style'));
		if (!allowed.length) return fail(422, { action: 'merge', error: 'Allow at least one merge style' });
		if (!allowed.includes(def)) return fail(422, { action: 'merge', error: 'The default style has to be one of the allowed ones' });
		const flags = Object.fromEntries(Object.entries(STYLES).map(([s, k]) => [k, allowed.includes(s)]));
		return (
			(await patch('merge', locals.token, params, { ...flags, default_merge_style: def, default_delete_branch_after_merge: f.has('delete_branch') })) ?? {
				action: 'merge',
				saved: true
			}
		);
	},
	rename: async ({ locals, params, request }) => {
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name || name === params.repo) return fail(422, { action: 'rename', error: 'Type a new name' });
		const failed = await patch('rename', locals.token, params, { name });
		if (failed) return failed;
		redirect(303, `/${params.owner}/${name}/settings`);
	},
	archive: async ({ locals, params, request }) => {
		const archived = (await request.formData()).get('archived') === '1';
		return patch('archive', locals.token, params, { archived });
	},
	delete: async ({ locals, params, request }) => {
		const confirm = String((await request.formData()).get('confirm') ?? '').trim();
		if (confirm.toLowerCase() !== `${params.owner}/${params.repo}`.toLowerCase()) return fail(422, { action: 'delete', error: `Type ${params.owner}/${params.repo} to confirm` });
		const failed = await send('delete', locals.token, `/repos/${params.owner}/${params.repo}`, 'DELETE');
		if (failed) return failed;
		redirect(303, `/${params.owner}`);
	}
};
