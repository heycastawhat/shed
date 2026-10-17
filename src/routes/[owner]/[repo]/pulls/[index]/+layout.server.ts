import { bodyAgent, commitAgent } from '#lib/sign.js';
import { api, type Pull } from '#lib/server/forgejo.js';

export async function load({ locals, params }) {
	const path = `/repos/${params.owner}/${params.repo}/pulls/${params.index}`;
	const [pull, commits] = await Promise.all([
		api<Pull>(locals.token, path),
		api<{ commit: { message: string } }[]>(locals.token, `${path}/commits?limit=50&files=false&verification=false`)
	]);
	return { pull, agent: bodyAgent(pull.body) ?? commits.map((c) => commitAgent(c.commit.message)).find(Boolean) };
}
