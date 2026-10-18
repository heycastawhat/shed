import { json } from '@sveltejs/kit';
import { api, type User } from '#lib/server/forgejo.js';

// People the @ picker offers: everyone with write access, since Forgejo has no "who can see this repo" list.
export async function GET({ locals, params }) {
	const users = await api<User[]>(locals.token, `/repos/${params.owner}/${params.repo}/assignees`);
	return json(users.map(({ login, full_name, avatar_url }) => ({ login, full_name, avatar_url })));
}
