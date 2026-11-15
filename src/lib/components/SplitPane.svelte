<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';
	import type { SplitItem } from '#lib/server/split.js';

	// The Split layout: the open PRs (or issues) down the left of the sheet, the one you opened beside them. Only on an item's pages;
	// the list page is already a list. Narrow screens get the item alone.
	let { list, kind, repo, children }: { list: Promise<SplitItem[]> | null; kind: 'pulls' | 'issues'; repo: string; children: Snippet } = $props();
	const current = $derived(Number(page.params.index));
	const label = $derived(kind === 'pulls' ? 'pull requests' : 'issues');
</script>

{#if list && current}
	<div class="split">
		<nav class="pane" aria-label="Open {label}">
			<a class="all" href="/{repo}/{kind}"><Icon name={kind === 'pulls' ? 'changes' : 'issue'} size={15} />Open {label}</a>
			{#await list}
				<p class="muted note">Loading…</p>
			{:then items}
				{#each items as it (it.number)}
					<a class="item" class:on={it.number === current} href="/{repo}/{kind}/{it.number}" aria-current={it.number === current ? 'page' : undefined}>
						<span class="title">{#if it.state === 'draft'}<span class="draft">Draft</span>{/if}{it.title}</span>
						<span class="meta">#{it.number} · {it.user} · {ago(it.updated)}</span>
					</a>
				{:else}
					<p class="muted note">No open {label}.</p>
				{/each}
			{/await}
		</nav>
		<div class="item-pane">{@render children()}</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.split {
		display: grid;
		grid-template-columns: 17rem minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}
	.pane {
		position: sticky;
		top: calc(var(--sticky-top, 0px) + 0.75rem);
		display: grid;
		gap: 2px;
		max-height: calc(100vh - var(--sticky-top, 0px) - 1.5rem);
		overflow-y: auto;
		padding: 0.4rem;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--fg) 3%, var(--bg));
		scrollbar-width: thin;
	}
	.all {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.6rem 0.5rem;
		color: var(--muted);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.all:hover {
		color: var(--fg);
	}
	.item {
		display: grid;
		gap: 0.15rem;
		padding: 0.5rem 0.65rem;
		border-radius: calc(var(--radius) - 4px);
		color: var(--fg);
	}
	.item:hover {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}
	.item.on {
		background: var(--accent-container);
		color: var(--on-accent-container);
	}
	.title {
		display: -webkit-box;
		overflow: hidden;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		font-size: 0.9rem;
		font-weight: 500;
		line-height: 1.3;
	}
	.draft {
		margin-right: 0.35rem;
		padding: 0 0.4rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
		font-size: 0.72rem;
		font-weight: 600;
	}
	.meta {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.item.on .meta {
		color: inherit;
		opacity: 0.75;
	}
	.note {
		padding: 0.5rem 0.65rem;
		font-size: 0.85rem;
	}
	/* Below this the item needs the whole sheet. */
	@media (max-width: 1199px) {
		.split {
			display: block;
		}
		.pane {
			display: none;
		}
	}
</style>
