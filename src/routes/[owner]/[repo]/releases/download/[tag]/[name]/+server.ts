import { error } from '@sveltejs/kit';
import { atLeast } from '#lib/server/access.js';
import { assetPath } from '#lib/server/api/releases.js';
import { db, root } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';

// A release asset's file, as a download; drafts' assets only for people who can see drafts.
export async function GET({ locals, params }) {
	const { row, level } = repoFor(locals, params.owner, params.repo);
	const a = db
		.query<{ id: number; name: string; uuid: string; draft: number }, [number, string, string]>(
			'select a.id, a.name, a.uuid, r.draft from release_assets a join releases r on r.id = a.release_id where r.repo_id = ? and r.tag = ? and a.name = ?'
		)
		.get(row.id, params.tag, params.name);
	if (!a || (a.draft && !atLeast(level, 'write'))) error(404, 'No such file');
	const file = Bun.file(assetPath(root, a.uuid));
	if (!(await file.exists())) error(404, 'The file is missing');
	db.query('update release_assets set download_count = download_count + 1 where id = ?').run(a.id);
	return new Response(file, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`,
			'content-length': String(file.size),
			'x-content-type-options': 'nosniff'
		}
	});
}
