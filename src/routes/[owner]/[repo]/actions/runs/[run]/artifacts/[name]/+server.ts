import { error } from '@sveltejs/kit';
import { artifactZip, type ArtifactRow } from '#lib/server/actions/artifacts.js';
import { db, root } from '#lib/server/shed.js';
import { repoFor } from '#lib/server/shedrepo.js';

export async function GET({ locals, params }) {
	const { row } = repoFor(locals, params.owner, params.repo);
	const a = db
		.query<ArtifactRow, [number, number, string]>("select a.* from artifacts a join runs r on r.id = a.run_id where r.repo_id = ? and r.number = ? and a.name = ? and a.status = 'done'")
		.get(row.id, Number(params.run), params.name);
	if (!a || Date.parse(a.expires_at) < Date.now()) error(404, 'Artifact not found (or expired)');
	return new Response(await artifactZip(root, a), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${encodeURIComponent(a.name)}.zip"` } });
}
