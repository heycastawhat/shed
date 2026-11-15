import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/forgejo.js';
import { send } from '#lib/server/issue.js';
import { db } from '#lib/server/shed.js';
import { getRepo } from '#lib/server/repos.js';

type Rule = {
	rule_name: string;
	required_approvals: number;
	status_check_contexts: string[];
	block_on_rejected_reviews: boolean;
	dismiss_stale_approvals: boolean;
	enable_push: boolean;
	enable_push_whitelist: boolean;
	enable_force_push: boolean;
};

export async function load({ locals, params }) {
	const rules = await api<Rule[]>(locals.token, `/repos/${params.owner}/${params.repo}/branch_protections`);
	const row = getRepo(db, params.owner, params.repo)!;
	// Checks that reported lately, so required checks can be picked rather than typed (they must match a status's name exactly).
	const seen = db
		.query<{ context: string }, [number]>('select context from statuses where repo_id = ? group by context order by max(id) desc limit 30')
		.all(row.id)
		.map((s) => s.context);
	return {
		rules: rules.map((r) => ({
			pattern: r.rule_name,
			approvals: r.required_approvals,
			checks: r.status_check_contexts,
			blockRejected: r.block_on_rejected_reviews,
			dismissStale: r.dismiss_stale_approvals,
			push: !r.enable_push ? 'none' : r.enable_push_whitelist ? 'admins' : 'all',
			force: r.enable_force_push
		})),
		seen
	};
}

export const actions = {
	save: async ({ locals, params, request }) => {
		const f = await request.formData();
		const old = String(f.get('old') ?? '');
		const pattern = String(f.get('pattern') ?? '').trim();
		if (!pattern) return fail(422, { action: 'save', rule: old, error: 'Name a branch or a pattern like release/*' });
		const checks = [
			...new Set(
				[
					...f.getAll('check').map(String),
					...String(f.get('other') ?? '')
						.split('\n')
						.map((s) => s.trim())
				].filter(Boolean)
			)
		];
		const push = String(f.get('push'));
		const body = {
			rule_name: pattern,
			required_approvals: Math.max(0, Math.floor(Number(f.get('approvals')) || 0)),
			enable_status_check: checks.length > 0,
			status_check_contexts: checks,
			block_on_rejected_reviews: f.has('block_rejected'),
			dismiss_stale_approvals: f.has('dismiss_stale'),
			enable_push: push !== 'none',
			enable_push_whitelist: push === 'admins',
			enable_force_push: f.has('force')
		};
		const base = `/repos/${params.owner}/${params.repo}/branch_protections`;
		const failed = old ? await send('save', locals.token, `${base}/${encodeURIComponent(old)}`, 'PATCH', body) : await send('save', locals.token, base, 'POST', body);
		if (failed) return fail(failed.status, { ...failed.data, rule: old });
		return { action: 'save', rule: old, saved: pattern };
	},
	delete: async ({ locals, params, request }) => {
		const pattern = String((await request.formData()).get('pattern'));
		return send('delete', locals.token, `/repos/${params.owner}/${params.repo}/branch_protections/${encodeURIComponent(pattern)}`, 'DELETE');
	}
};
