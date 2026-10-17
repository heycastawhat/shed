import { apiPage, type Commit } from '#lib/server/forgejo.js';

const PER_PAGE = 30;

export async function load({ locals, params, url }) {
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const { items, total } = await apiPage<Commit>(
		locals.token,
		`/repos/${params.owner}/${params.repo}/commits?sha=${encodeURIComponent(params.ref)}&page=${page}&limit=${PER_PAGE}&stat=false&verification=false&files=false`
	);
	return { commits: items, page, pages: Math.ceil(total / PER_PAGE) };
}
