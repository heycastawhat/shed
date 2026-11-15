import { redirect } from '@sveltejs/kit';
import { visibleRepos } from '#lib/server/shedrepo.js';

export function load({ locals, url }) {
	if (!locals.user) redirect(303, '/login');
	return { repos: visibleRepos(locals.user.id, url.origin).slice(0, 100) };
}
