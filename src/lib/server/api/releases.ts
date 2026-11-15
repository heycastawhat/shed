import { error } from '@sveltejs/kit';
import { mkdir, rm } from 'node:fs/promises';
import { record } from '../activity.js';
import { git } from '../git.js';
import { afterPush, refSnapshot } from '../push.js';
import { now, refSha, repoOf, userJson, type RepoCtx } from './common.js';
import { me, page, Paged, route, type Ctx } from './router.js';

type ReleaseRow = { id: number; repo_id: number; tag: string; target: string; name: string; body: string; draft: number; prerelease: number; user_id: number; created_at: string; published_at: string | null };
type AssetRow = { id: number; release_id: number; name: string; size: number; uuid: string; download_count: number; created_at: string };

export const assetPath = (root: string, uuid: string) => `${root}/attachments/${uuid.slice(0, 2)}/${uuid}`;

function json(c: Ctx, r: RepoCtx, x: ReleaseRow) {
	const base = `${c.origin}/${r.full}`;
	return {
		id: x.id,
		tag_name: x.tag,
		target_commitish: x.target,
		name: x.name,
		body: x.body,
		draft: !!x.draft,
		prerelease: !!x.prerelease,
		created_at: x.created_at,
		published_at: x.published_at ?? x.created_at,
		author: userJson(c.db, x.user_id),
		html_url: `${base}/releases/tag/${encodeURIComponent(x.tag)}`,
		tarball_url: `${base}/archive/${encodeURIComponent(x.tag)}.tar.gz`,
		zipball_url: `${base}/archive/${encodeURIComponent(x.tag)}.zip`,
		assets: c.db
			.query<AssetRow, [number]>('select * from release_assets where release_id = ? order by name')
			.all(x.id)
			.map((a) => ({ id: a.id, name: a.name, size: a.size, download_count: a.download_count, created_at: a.created_at, uuid: a.uuid, browser_download_url: `${base}/releases/download/${encodeURIComponent(x.tag)}/${encodeURIComponent(a.name)}` }))
	};
}

const releaseOf = (c: Ctx, r: RepoCtx) => c.db.query<ReleaseRow, [number, number]>('select * from releases where id = ? and repo_id = ?').get(Number(c.params.id), r.row.id) ?? error(404, 'Release not found');

route('GET', '/repos/:owner/:repo/releases', (c) => {
	const r = repoOf(c);
	const drafts = r.level === 'write' || r.level === 'admin';
	const rows = c.db.query<ReleaseRow, [number]>('select * from releases where repo_id = ? order by coalesce(published_at, created_at) desc').all(r.row.id).filter((x) => drafts || !x.draft);
	const p = page(c);
	return new Paged(rows.slice(p.offset, p.offset + p.limit).map((x) => json(c, r, x)), rows.length);
});
route('GET', '/repos/:owner/:repo/releases/latest', (c) => {
	const r = repoOf(c);
	const x = c.db.query<ReleaseRow, [number]>('select * from releases where repo_id = ? and draft = 0 and prerelease = 0 order by coalesce(published_at, created_at) desc').get(r.row.id) ?? error(404, 'No releases');
	return json(c, r, x);
});
route('GET', '/repos/:owner/:repo/releases/tags/*tag', (c) => {
	const r = repoOf(c);
	return json(c, r, c.db.query<ReleaseRow, [number, string]>('select * from releases where repo_id = ? and tag = ?').get(r.row.id, c.params.tag) ?? error(404, 'Release not found'));
});
route('GET', '/repos/:owner/:repo/releases/:id', (c) => {
	const r = repoOf(c);
	return json(c, r, releaseOf(c, r));
});

// A release's tag is made from `target_commitish` if it doesn't exist yet.
route('POST', '/repos/:owner/:repo/releases', async (c) => {
	const r = repoOf(c, 'write');
	const u = me(c);
	const b = await c.body<{ tag_name: string; target_commitish?: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean }>();
	if (!/^[A-Za-z0-9._/-]{1,200}$/.test(b.tag_name ?? '') || b.tag_name.includes('..') || b.tag_name.startsWith('-')) error(422, 'Invalid tag name');
	if (c.db.query('select 1 from releases where repo_id = ? and tag = ?').get(r.row.id, b.tag_name)) error(409, `There's already a release for ${b.tag_name}`);
	if (!b.draft && !(await refSha(r.dir, `refs/tags/${b.tag_name}`))) {
		const sha = (await refSha(r.dir, b.target_commitish || r.row.default_branch)) ?? error(404, `Can't find ${b.target_commitish}`);
		const before = await refSnapshot(r.dir);
		await git(r.dir, ['update-ref', `refs/tags/${b.tag_name}`, sha, '0'.repeat(40)]);
		await afterPush(c.db, c.root, r.row, u.id, before);
	}
	const id = Number(
		c.db
			.query('insert into releases (repo_id, tag, target, name, body, draft, prerelease, user_id, published_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.run(r.row.id, b.tag_name, b.target_commitish ?? r.row.default_branch, b.name || b.tag_name, b.body ?? '', +!!b.draft, +!!b.prerelease, u.id, b.draft ? null : now())
			.lastInsertRowid
	);
	if (!b.draft) record(c.db, { userId: u.id, repoId: r.row.id, op: 'publish_release', ref: `refs/tags/${b.tag_name}`, content: b.name || b.tag_name });
	return json(c, r, c.db.query<ReleaseRow, [number]>('select * from releases where id = ?').get(id)!);
});
route('PATCH', '/repos/:owner/:repo/releases/:id', async (c) => {
	const r = repoOf(c, 'write');
	const x = releaseOf(c, r);
	const b = await c.body<{ name?: string; body?: string; draft?: boolean; prerelease?: boolean; tag_name?: string; target_commitish?: string }>();
	const draft = b.draft ?? !!x.draft;
	const tag = b.tag_name ?? x.tag;
	if (!draft && !(await refSha(r.dir, `refs/tags/${tag}`))) {
		const sha = (await refSha(r.dir, b.target_commitish ?? x.target)) ?? error(404, `Can't find ${x.target}`);
		const before = await refSnapshot(r.dir);
		await git(r.dir, ['update-ref', `refs/tags/${tag}`, sha, '0'.repeat(40)]);
		await afterPush(c.db, c.root, r.row, me(c).id, before);
	}
	c.db
		.query('update releases set name = ?, body = ?, draft = ?, prerelease = ?, tag = ?, target = ?, published_at = coalesce(published_at, ?) where id = ?')
		.run(b.name ?? x.name, b.body ?? x.body, +draft, +(b.prerelease ?? !!x.prerelease), tag, b.target_commitish ?? x.target, draft ? null : now(), x.id);
	return json(c, r, c.db.query<ReleaseRow, [number]>('select * from releases where id = ?').get(x.id)!);
});
route('DELETE', '/repos/:owner/:repo/releases/:id', async (c) => {
	const r = repoOf(c, 'write');
	const x = releaseOf(c, r);
	for (const a of c.db.query<AssetRow, [number]>('select * from release_assets where release_id = ?').all(x.id)) await rm(assetPath(c.root, a.uuid), { force: true });
	c.db.query('delete from releases where id = ?').run(x.id);
});

// Assets arrive as multipart `attachment`, named by ?name= or the file's own name.
route('POST', '/repos/:owner/:repo/releases/:id/assets', async (c) => {
	const r = repoOf(c, 'write');
	const x = releaseOf(c, r);
	const form = await c.request.formData();
	const file = form.get('attachment');
	if (!(file instanceof File)) error(422, 'Send the file as multipart field "attachment"');
	const name = (c.url.searchParams.get('name') || file.name).replace(/[/\\]/g, '_');
	if (!name) error(422, 'The asset needs a name');
	const uuid = crypto.randomUUID();
	await mkdir(assetPath(c.root, uuid).replace(/\/[^/]+$/, ''), { recursive: true });
	await Bun.write(assetPath(c.root, uuid), file);
	const id = Number(c.db.query('insert into release_assets (release_id, name, size, uuid) values (?, ?, ?, ?)').run(x.id, name, file.size, uuid).lastInsertRowid);
	return json(c, r, x).assets.find((a) => a.id === id);
});
route('DELETE', '/repos/:owner/:repo/releases/:id/assets/:asset', async (c) => {
	const r = repoOf(c, 'write');
	const x = releaseOf(c, r);
	const a = c.db.query<AssetRow, [number, number]>('select * from release_assets where id = ? and release_id = ?').get(Number(c.params.asset), x.id) ?? error(404, 'Asset not found');
	await rm(assetPath(c.root, a.uuid), { force: true });
	c.db.query('delete from release_assets where id = ?').run(a.id);
});
