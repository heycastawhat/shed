type Thread = {
	pendingRuntimeRequest: { kind: string } | null;
	activeRunId: string | null;
	status: string;
};

export function status(t: Thread) {
	if (t.pendingRuntimeRequest) return { kind: 'ask', label: t.pendingRuntimeRequest.kind === 'user_input' ? 'Has a question' : 'Needs your OK' };
	if (t.activeRunId) return { kind: 'run', label: 'Working' };
	if (t.status === 'completed') return { kind: 'done', label: 'Done' };
	return {
		kind: /fail|error/.test(t.status) ? 'fail' : 'idle',
		label: t.status[0].toUpperCase() + t.status.slice(1)
	};
}

const KINDS: Record<string, string> = {
	command: 'run a command',
	'file-change': 'change files',
	'file-read': 'read files'
};
export const kind = (k: string) => KINDS[k] ?? k.replaceAll(/[-_]/g, ' ');

// Agents work in T3 worktrees, so show paths relative to the checkout.
export const rel = (s: string | null | undefined) => s?.replace(/\/\S*\/worktrees\/[^/]+\/[^/]+\//g, '') ?? '';
