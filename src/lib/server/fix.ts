import { error, redirect } from '@sveltejs/kit';
import { api, requirePush, type Pull, type ReviewComment, type User } from './forgejo.js';
import { hostWithProject, startTask } from './t3.js';

// Hands one review thread to a T3 agent on the PR's branch. Once its push changes the line, the thread counts as outdated.
export async function fixWithAgent(token: string | undefined, owner: string, repo: string, index: string, form: FormData) {
	const pr = `/repos/${owner}/${repo}/pulls/${index}`;
	await requirePush(token, `${owner}/${repo}`);
	const [pull, c] = await Promise.all([
		api<Pull>(token, pr),
		api<ReviewComment>(token, `${pr}/reviews/${form.get('review')}/comments/${form.get('comment')}`)
	]);
	const branch = pull.head.ref;
	const text = [
		`Address this review comment on pull request #${pull.number} ("${pull.title}") in ${owner}/${repo}.`,
		'',
		`${c.path}, ${c.position ? `line ${c.position}` : `old line ${c.original_position} (a deleted line)`}`,
		`${c.user.login} wrote: ${c.body}`,
		'',
		'The code it points at:',
		'```diff',
		c.diff_hunk.split('\n').slice(-6).join('\n'),
		'```',
		'',
		`You're in a worktree started from origin/${branch}, the PR's branch.`,
		"If the comment is a question rather than a change request, don't change code: answer it in your final message.",
		`Otherwise make the fix, commit it with a short message, and push it to the PR with \`git push origin HEAD:${branch}\`. Never force-push.`
	].join('\n');
	const title = `#${pull.number} ${c.path.split('/').pop()}: ${c.body.split('\n')[0]}`;
	const me = await api<User>(token, '/user');
	const host = await hostWithProject(me.id, repo);
	if (!host) error(400, `No reachable T3 Code host has a project called "${repo}"`);
	const thread = await startTask(host, `${owner}/${repo}`, { userId: me.id, pushTo: [branch], text, title, runtimeMode: 'auto-accept-edits', baseRef: branch, fromOrigin: true });
	redirect(303, `/${owner}/${repo}/agents?thread=${encodeURIComponent(thread)}`);
}
