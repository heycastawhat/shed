import { error } from '@sveltejs/kit';
import { resolve } from '#lib/server/browse.js';
import { spawn } from '#lib/server/git.js';
import { repoFor } from '#lib/server/shedrepo.js';

// Source downloads: /owner/repo/archive/<ref>.zip or .tar.gz, named <repo>-<ref> inside.
export async function GET({ locals, params }) {
	const m = params.file.match(/^(.+)\.(zip|tar\.gz)$/);
	if (!m) error(404, 'Use .zip or .tar.gz');
	const { dir } = repoFor(locals, params.owner, params.repo);
	const sha = await resolve(dir, m[1]);
	if (!sha) error(404, `No branch, tag or commit called ${m[1]}`);
	const name = `${params.repo}-${m[1].replace(/[^A-Za-z0-9._-]+/g, '-')}`;
	const proc = spawn(['--git-dir', dir, 'archive', `--format=${m[2] === 'zip' ? 'zip' : 'tar.gz'}`, `--prefix=${name}/`, sha]);
	return new Response(proc.stdout, {
		headers: { 'content-type': m[2] === 'zip' ? 'application/zip' : 'application/gzip', 'content-disposition': `attachment; filename="${name}.${m[2]}"` }
	});
}
