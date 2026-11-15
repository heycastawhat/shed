import { error } from '@sveltejs/kit';
import { toUser, type UserRow } from '../accounts.js';
import { removeAvatar, saveAvatar } from '../avatars.js';
import { createOrg, deleteOrg, getOrg, ownsOrg, removeMember, roleIn, setMember, transferRepo, updateProfile } from '../orgs.js';
import { getRepo } from '../repos.js';
import { repoJson, repoOf, userByLogin, userRow } from './common.js';
import { me, route, type Ctx } from './router.js';

// Account-level writes: a personal token needs repo:write for them, as it does for pushing.
function writer(c: Ctx) {
	const u = me(c);
	if (c.token && !c.token.scopes.includes('repo:write')) error(403, 'This token is read-only');
	return u;
}

export const orgJson = (u: UserRow & { description?: string; website?: string; location?: string }) => ({
	...toUser(u),
	username: u.login,
	name: u.login,
	description: u.description ?? '',
	website: u.website ?? '',
	location: u.location ?? '',
	visibility: 'public'
});

const orgOf = (c: Ctx) => getOrg(c.db, c.params.org) ?? error(404, 'Organization not found');
function ownedOrg(c: Ctx) {
	const org = orgOf(c);
	if (!ownsOrg(c.db, org.id, writer(c))) error(403, `Only owners of ${org.login} can do that`);
	return org;
}
const person = (c: Ctx) => userByLogin(c.db, c.params.user) ?? error(404, `No user called ${c.params.user}`);

// --- organizations ---

route('POST', '/orgs', async (c) => {
	const id = createOrg(c.db, writer(c).id, await c.body());
	return orgJson(userRow(c.db, id));
});
route('PATCH', '/orgs/:org', async (c) => {
	const org = ownedOrg(c);
	updateProfile(c.db, org.id, await c.body());
	return orgJson(userRow(c.db, org.id));
});
route('DELETE', '/orgs/:org', async (c) => {
	const org = ownedOrg(c);
	deleteOrg(c.db, org.id);
	await removeAvatar(c.db, c.root, org.id);
});
route('GET', '/orgs/:org/members/:user', (c) => (roleIn(c.db, orgOf(c).id, person(c).id) ? undefined : error(404, 'Not a member')));
// Shed's own: Forgejo manages membership through teams, Shed has only the two roles.
route('PUT', '/orgs/:org/members/:user', async (c) => {
	const org = ownedOrg(c);
	const u = person(c);
	setMember(c.db, org.id, u.id, (await c.body<{ role?: 'owner' | 'member' }>()).role ?? 'member');
	return { ...toUser(u), role: roleIn(c.db, org.id, u.id) };
});
// Owners remove anyone; members may leave.
route('DELETE', '/orgs/:org/members/:user', (c) => {
	const org = orgOf(c);
	const u = person(c);
	if (u.id !== writer(c).id) ownedOrg(c);
	removeMember(c.db, org.id, u.id);
});
route('POST', '/orgs/:org/avatar', async (c) => {
	const org = ownedOrg(c);
	await saveAvatar(c.db, c.root, org.id, decode((await c.body<{ image?: string }>()).image));
});
route('DELETE', '/orgs/:org/avatar', (c) => removeAvatar(c.db, c.root, ownedOrg(c).id));

// --- your profile ---

const settingsJson = (u: UserRow & { description?: string; website?: string; location?: string }) => ({
	full_name: u.name,
	description: u.description ?? '',
	website: u.website ?? '',
	location: u.location ?? '',
	language: '',
	theme: '',
	diff_view_style: '',
	hide_email: true,
	hide_activity: false
});
route('GET', '/user/settings', (c) => settingsJson(userRow(c.db, me(c).id)));
route('PATCH', '/user/settings', async (c) => {
	const u = writer(c);
	updateProfile(c.db, u.id, await c.body());
	return settingsJson(userRow(c.db, u.id));
});
route('POST', '/user/avatar', async (c) => {
	const u = writer(c);
	await saveAvatar(c.db, c.root, u.id, decode((await c.body<{ image?: string }>()).image));
});
route('DELETE', '/user/avatar', (c) => removeAvatar(c.db, c.root, writer(c).id));

function decode(image: unknown) {
	if (typeof image !== 'string' || !image) error(422, 'Send the image as base64 in "image"');
	try {
		return Uint8Array.fromBase64(image.replace(/^data:[^,]*,/, ''));
	} catch {
		error(422, 'The image is not valid base64');
	}
}

// --- transfer ---

// To yourself or an org you own (site admins: anyone). Forgejo answers 202, since its transfers can wait for the recipient.
route('POST', '/repos/:owner/:repo/transfer', async (c) => {
	const { row } = repoOf(c, 'admin');
	const u = writer(c);
	const name = (await c.body<{ new_owner?: string }>()).new_owner ?? '';
	const to = userByLogin(c.db, name) ?? error(404, `No user or organization called ${name}`);
	const allowed = u.admin || to.id === u.id || (to.kind === 'org' && ownsOrg(c.db, to.id, u));
	if (!allowed) error(403, to.kind === 'org' ? `You need to be an owner of ${to.login}` : 'You can only transfer to yourself or an organization you own');
	transferRepo(c.db, row, to);
	const moved = getRepo(c.db, to.login, row.name)!;
	return new Response(JSON.stringify(await repoJson(c, moved)), { status: 202, headers: { 'content-type': 'application/json' } });
});
