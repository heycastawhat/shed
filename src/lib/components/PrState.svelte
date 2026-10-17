<script lang="ts">
	import GitMerge from '@mingcute/svelte/core-regular/git-merge';
	import GitPullRequest from '@mingcute/svelte/core-regular/git-pull-request';
	import GitPullRequestClosed from '@mingcute/svelte/core-regular/git-pull-request-close';
	import GitPullRequestDraft from '@mingcute/svelte/core-regular/pencil';

	let { pull }: { pull: { state: string; merged: boolean; draft: boolean } } = $props();
	const kind = $derived(pull.merged ? 'merged' : pull.state === 'closed' ? 'closed' : pull.draft ? 'draft' : 'open');
	const Svg = $derived({ merged: GitMerge, closed: GitPullRequestClosed, draft: GitPullRequestDraft, open: GitPullRequest }[kind]);
</script>

<span class="state {kind}">
	<Svg size={14} />
	{kind}
</span>

<style>
	.state {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.6rem 0.1rem 0.45rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: capitalize;
		white-space: nowrap;
		border: 1px solid transparent;
	}
	.open {
		background: var(--accent);
		color: var(--bg);
	}
	.draft {
		color: var(--muted);
		border-color: var(--border);
	}
	.merged {
		color: var(--accent);
		border-color: var(--accent);
	}
	.closed {
		color: var(--del-fg);
		border-color: var(--del-fg);
	}
</style>
