import { error } from '@sveltejs/kit';
import { FORGEJO_URL } from '$app/env/private';
import type { Repo } from '#lib/server/forgejo.js';
import type { RepoFull } from '#lib/server/repo-settings.js';

export async function load({ parent }) {
	const { repo } = (await parent()) as { repo: Repo };
	if (!repo.permissions.admin) error(403, 'Only repository admins can change its settings');
	return { repo, full: repo as RepoFull, forgejo: `${FORGEJO_URL}/${repo.full_name}/settings` };
}
