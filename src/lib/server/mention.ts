import { isHttpError } from '@sveltejs/kit';
import { parseDiff } from '#lib/diff.js';
import { mentionsAgent, withoutMention } from '#lib/mention.js';
import { sign } from '#lib/sign.js';
import { status } from '#lib/agent-status.js';
import { api, request, type Issue, type Pull, type Repo, type User } from './forgejo.js';
import { userToken } from './auth.js';
import { hostsFor, hostWithProject, projection, shell, startTask } from './t3.js';
import { read, update, type Mention } from './store.js';

type Where = { owner: string; repo: string; index: string };
type Line = { path: string; line: string };

// Replies go where the mention was: the conversation, or the line comment's thread.
async function reply(token: string, repo: string, number: number, line: Line | undefined, body: string) {
	const [side, n] = line?.line.split(':') ?? [];
	await request(token, line ? `/repos/${repo}/pulls/${number}/reviews` : `/repos/${repo}/issues/${number}/comments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(line ? { event: 'COMMENT', body: '', comments: [{ path: line.path, body, [side === 'old' ? 'old_position' : 'new_position']: Number(n) }] } : { body })
	});
}

// The few diff lines up to the commented one, as the agent would see them in a review.
async function hunk(token: string, repo: string, number: number, { path, line }: Line) {
	const [side, n] = line.split(':');
	const file = parseDiff(await (await request(token, `/repos/${repo}/pulls/${number}.diff`)).text()).find((f) => f.to === path || f.from === path);
	for (const h of file?.hunks ?? []) {
		const i = h.lines.findIndex((l) => (side === 'old' ? l.old : l.new) === Number(n) && (side === 'old' ? l.kind !== 'add' : l.kind !== 'del'));
		if (i >= 0) return h.lines.slice(Math.max(0, i - 5), i + 1).map((l) => (l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ') + l.text).join('\n');
	}
	return '';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');

// Called after a comment posted through forge. `@agent` starts a T3 task for the commenter on their own host and says so in a reply.
// The comment is already posted, so a problem comes back as a successful result carrying an error, which clears the composer and shows the error.
export async function mention(token: string | undefined, origin: string, where: Where, body: string, line?: Line) {
	if (!token || !mentionsAgent(body)) return;
	const repo = `${where.owner}/${where.repo}`;
	try {
		const [me, issue] = await Promise.all([api<User>(token, '/user'), api<Issue>(token, `/repos/${repo}/issues/${where.index}`)]);
		const host = await hostWithProject(me.id, where.repo);
		if (!host) return { action: 'comment', error: `@agent needs one of your T3 Code hosts (Settings → Agents) to have a project called "${where.repo}"`, posted: true };
		const ask = withoutMention(body);
		let text: string, baseRef: string;
		if (issue.pull_request) {
			const pull = await api<Pull>(token, `/repos/${repo}/pulls/${where.index}`);
			baseRef = pull.head.ref;
			const code = line && (await hunk(token, repo, pull.number, line));
			text = [
				`${me.login} asked you on pull request #${pull.number} ("${pull.title}") in ${repo}:`,
				'',
				ask,
				...(line ? ['', `This was a comment on ${line.path}, ${line.line.startsWith('old') ? 'old line' : 'line'} ${line.line.split(':')[1]}.`] : []),
				...(code ? ['The code it points at:', '```diff', code, '```'] : []),
				'',
				`You're in a worktree started from origin/${baseRef}, the PR's branch.`,
				"If it's a question rather than a change request, don't change code: answer it in your final message.",
				`Otherwise make the change, commit it with a short message, and push it to the PR with \`git push origin HEAD:${baseRef}\`. Never force-push.`,
				'End with a short summary of what you did; it is posted back to the PR.'
			].join('\n');
		} else {
			baseRef = (await api<Repo>(token, `/repos/${repo}`)).default_branch;
			const branch = `agent/issue-${issue.number}-${slug(issue.title)}`;
			text = [
				`${me.login} asked you on issue #${issue.number} ("${issue.title}") in ${repo}:`,
				'',
				ask,
				'',
				'The issue says:',
				issue.body.trim() || '(no description)',
				'',
				`You're in a worktree started from origin/${baseRef}.`,
				"If it's a question rather than a change request, don't change code: answer it in your final message.",
				`Otherwise do the work on a new branch \`${branch}\`, commit it, and push it with \`git push origin HEAD:${branch}\`. Never force-push.`,
				`Then open a pull request into ${baseRef} that mentions #${issue.number}: use forge's \`open_pull_request\` MCP tool if you have it, otherwise just say the branch name in your final message.`,
				'End with a short summary of what you did; it is posted back to the issue.'
			].join('\n');
		}
		const thread = await startTask(host, where.repo, { text, title: `#${issue.number} ${ask.split('\n')[0]}`, runtimeMode: 'auto-accept-edits', baseRef, fromOrigin: true });
		const url = `${origin}/agents/${encodeURIComponent(host.id)}/${encodeURIComponent(thread)}`;
		const m: Mention = {
			id: crypto.randomUUID(),
			userId: me.id,
			host: host.id,
			thread,
			url,
			repo,
			number: issue.number,
			kind: issue.pull_request ? 'pull' : 'issue',
			line: line && { path: line.path, line: line.line },
			createdAt: new Date().toISOString(),
			done: false
		};
		await update((d) => d.mentions.push(m));
		await reply(token, repo, issue.number, line, sign(`On it: [follow the task](${url}).`, 'agent', me.login));
	} catch (e) {
		if (isHttpError(e)) return { action: 'comment', error: `Couldn't start @agent: ${e.body.message}`, posted: true };
		throw e;
	}
}

// The agent's last message, cut short enough for a comment; a cut inside a code block closes the block.
function summary(text: string) {
	if (text.length <= 4000) return text;
	const cut = text.slice(0, text.lastIndexOf('\n', 4000) > 3000 ? text.lastIndexOf('\n', 4000) : 4000);
	return `${cut}${(cut.match(/^(```|~~~)/gm)?.length ?? 0) % 2 ? '\n```' : ''}\n\n…`;
}

// Posts the result of every finished mention task. Runs from the request hook at most every 15s; a mention is marked done
// before anything is awaited, so overlapping runs can't post twice.
async function check() {
	const open = (await read()).mentions.filter((m) => !m.done);
	for (const userId of new Set(open.map((m) => m.userId))) {
		const hosts = await hostsFor(userId);
		for (const host of hosts) {
			const mine = open.filter((m) => m.userId === userId && m.host === host.id);
			if (!mine.length) continue;
			const snap = await shell(host).catch(() => null);
			if (!snap) continue;
			for (const m of mine) {
				const t = snap.threads.find((t) => t.id === m.thread);
				if (t && !t.deletedAt && (t.activeRunId || t.pendingRuntimeRequest || !t.latestRunId)) continue;
				if (m.done) continue;
				m.done = true;
				try {
					if (t && !t.deletedAt) {
						const s = status(t);
						const last = (await projection(host, t.id)).visibleTurnItems.findLast(({ item }) => item.type === 'assistant_message' && item.text)?.item.text;
						const body =
							s.kind !== 'fail' && last ? `Done ([task](${m.url})):\n\n${summary(last)}` : `The agent stopped (${s.label.toLowerCase()}) without a summary. [See the task](${m.url}).`;
						const token = await userToken(userId);
						const me = await api<User>(token, '/user');
						await reply(token, m.repo, m.number, m.line, sign(body, 'agent', me.login));
					}
				} catch (e) {
					console.error(`@agent reply for ${m.repo}#${m.number}`, e);
				}
				await update(() => {});
			}
		}
	}
	// Hosts the user has since removed can't report back.
	const gone = open.filter((m) => !m.done && Date.now() - Date.parse(m.createdAt) > 7 * 86400_000);
	if (gone.length) await update(() => gone.forEach((m) => (m.done = true)));
}

let last = 0;
export function sweepMentions() {
	if (Date.now() - last < 15_000) return;
	last = Date.now();
	check().catch((e) => console.error('@agent sweep', e));
}
