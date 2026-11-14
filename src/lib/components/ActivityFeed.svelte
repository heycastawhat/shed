<script lang="ts">
	import Byline from '#lib/components/Byline.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import type { FeedEvent } from '#lib/server/feed.js';
	import { ago } from '#lib/time.js';

	// `who` shows the actor on every line; `repo` drops the repo name where it's the page's own.
	let { feed, who = true, repo = false }: { feed: FeedEvent[]; who?: boolean; repo?: boolean } = $props();

	const VERB: Record<string, [string, string]> = {
		create_repo: ['repos', 'created'],
		create_branch: ['branch', 'created branch'],
		commit_repo: ['commit', 'pushed to'],
		create_issue: ['issue', 'opened issue'],
		create_pull_request: ['changes', 'opened'],
		comment_issue: ['message', 'commented on'],
		comment_pull: ['message', 'commented on'],
		close_issue: ['done', 'closed issue'],
		reopen_issue: ['issue', 'reopened issue'],
		close_pull_request: ['x', 'closed'],
		reopen_pull_request: ['changes', 'reopened'],
		merge_pull_request: ['merge', 'merged'],
		auto_merge_pull_request: ['merge', 'auto-merged'],
		approve_pull_request: ['check', 'approved'],
		reject_pull_request: ['x', 'requested changes on'],
		push_tag: ['tag', 'pushed tag'],
		delete_tag: ['trash', 'deleted tag'],
		delete_branch: ['trash', 'deleted branch'],
		publish_release: ['release', 'released'],
		star_repo: ['star', 'starred']
	};
	const isPull = (op: string) => op.includes('pull');
</script>

<ol class="feed">
	{#each feed as a (a.id)}
		{@const [icon, verb] = VERB[a.op] ?? ['clock', a.op.replaceAll('_', ' ')]}
		<li>
			<span class="dot"><Icon name={icon} size={14} /></span>
			<div>
				<div>
					{#if a.agent}<Byline bold login={a.who} agent={a.agent} />{:else if who}<a class="who" href="/{a.who}">{a.who}</a>{/if}
					{verb}
					{#if a.number}
						<a href="/{a.repo}/{isPull(a.op) ? 'pulls' : 'issues'}/{a.number}">{repo ? '' : a.repo}#{a.number}</a>
					{:else if a.ref && a.op !== 'create_repo'}
						<code>{a.ref}</code>{#if !repo}{' in '}<a href="/{a.repo}">{a.repo}</a>{/if}
					{:else}
						<a href="/{a.repo}">{a.repo}</a>
					{/if}
					<span class="muted when">{ago(a.created)}</span>
				</div>
				{#if a.title}<div class="detail" class:quote={a.op.startsWith('comment')}>{a.title}</div>{/if}
				{#each a.commits as c (c.sha)}
					<div class="detail commit"><a href="/{a.repo}/commit/{c.sha}"><code>{c.sha.slice(0, 7)}</code></a> {c.message}</div>
				{/each}
				{#if a.more}<div class="detail muted commit">and {a.more} more commit{a.more === 1 ? '' : 's'}</div>{/if}
			</div>
		</li>
	{/each}
</ol>

<style>
	.feed {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.feed li {
		display: flex;
		gap: 0.75rem;
		padding-bottom: 1rem;
		position: relative;
		font-size: 0.9rem;
	}
	.feed li:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 13px;
		top: 28px;
		bottom: 2px;
		width: 1px;
		background: var(--border);
	}
	.dot {
		display: grid;
		place-items: center;
		flex: none;
		width: 27px;
		height: 27px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--muted);
	}
	.feed li > div {
		min-width: 0;
		padding-top: 0.2rem;
	}
	.who {
		font-weight: 600;
		color: var(--fg);
	}
	.when {
		margin-left: 0.3rem;
		white-space: nowrap;
		font-size: 0.8rem;
	}
	.detail {
		margin-top: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.quote {
		color: var(--muted);
		padding-left: 0.6rem;
		border-left: 2px solid var(--border);
	}
	.commit {
		font-size: 0.85rem;
	}
</style>
