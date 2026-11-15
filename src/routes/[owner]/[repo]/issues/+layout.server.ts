import { splitList } from '#lib/server/split.js';

export function load({ locals, cookies, params }) {
	return { split: splitList(locals, cookies, params.owner, params.repo, 'issues') };
}
