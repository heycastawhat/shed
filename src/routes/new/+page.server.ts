import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { getRepo, createRepo, repoDir } from '#lib/server/repos.js';
import { db, root } from '#lib/server/shed.js';
import { GITIGNORES, LICENSES } from '#lib/server/templates.js';
import { commitFiles, type Change } from '#lib/server/write.js';
import { record } from '#lib/server/activity.js';

// Owners you can create under: yourself, and orgs you own or belong to.
function owners(userId: number) {
	return db
		.query<{ id: number; login: string }, [number, number]>(
			"select id, login from users where id = ? union all select u.id, u.login from users u join org_members m on m.org_id = u.id where m.user_id = ? and u.kind = 'org'"
		)
		.all(userId, userId);
}

export function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	return {
		owners: owners(locals.user.id).map((o) => o.login),
		gitignores: Object.keys(GITIGNORES),
		licenses: Object.entries(LICENSES).map(([key, l]) => ({ key, name: l.name }))
	};
}

export const actions = {
	default: async ({ locals, request }) => {
		const me = locals.user;
		if (!me) redirect(303, '/login');
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();
		const values = { owner: get('owner'), name: get('name'), description: get('description'), visibility: get('visibility'), readme: form.has('readme'), gitignore: get('gitignore'), license: get('license'), branch: get('branch') || 'main' };
		const owner = owners(me.id).find((o) => o.login === values.owner);
		if (!owner) return fail(400, { error: 'Pick an owner', values });
		try {
			const id = await createRepo(db, root, owner.id, { name: values.name, description: values.description, private: values.visibility !== 'public', defaultBranch: values.branch });
			const changes: Change[] = [];
			if (values.readme) changes.push({ path: 'README.md', content: `# ${values.name}\n${values.description ? `\n${values.description}\n` : ''}` });
			if (GITIGNORES[values.gitignore]) changes.push({ path: '.gitignore', content: GITIGNORES[values.gitignore] });
			if (LICENSES[values.license]) changes.push({ path: 'LICENSE', content: LICENSES[values.license].text(me.name || me.login) });
			if (changes.length) {
				await commitFiles(repoDir(root, id), { branch: values.branch, parent: null, changes, message: 'Initial commit', author: { name: me.name || me.login, email: me.email ?? `${me.login}@users.noreply` } });
				record(db, { userId: me.id, repoId: id, op: 'commit_repo', ref: `refs/heads/${values.branch}`, content: { Commits: [] } });
			}
			record(db, { userId: me.id, repoId: id, op: 'create_repo' });
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message, values });
			throw e;
		}
		redirect(303, `/${owner.login}/${getRepo(db, owner.login, values.name)!.name}`);
	}
};
