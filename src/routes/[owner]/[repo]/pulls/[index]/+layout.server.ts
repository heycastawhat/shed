import { bodyAgent, commitAgent } from '#lib/sign.js';
import { api, type Pull } from '#lib/server/forgejo.js';
import { taskOn } from '#lib/server/t3.js';

export async function load({ locals, params }) {
	const path = `/repos/${params.owner}/${params.repo}/pulls/${params.index}`;
	const [pull, commits] = await Promise.all([
		api<Pull>(locals.token, path),
		api<{ commit: { message: string } }[]>(locals.token, `${path}/commits?limit=1&files=false&verification=false`)
	]);
	// The first commit says who wrote the PR; agent commits pushed later (Fix with agent, @agent) don't make a person's PR an agent's.
	const agent = bodyAgent(pull.body) ?? (commits[0] && commitAgent(commits[0].commit.message));
	if (agent) return { pull, agent };
	const task = await taskOn(`${params.owner}/${params.repo}`, pull.head.ref, pull.created_at);
	return { pull, agent: task?.agent, agentHref: task && `/agents/${encodeURIComponent(task.host)}/${encodeURIComponent(task.thread)}` };
}
