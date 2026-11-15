import { error } from '@sveltejs/kit';

export async function load({ parent }) {
	const { repo } = await parent();
	if (!repo.permissions.admin) error(403, `Only admins of ${repo.full_name} can change its settings`);
}
