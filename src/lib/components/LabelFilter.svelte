<script lang="ts" module>
	export const listQuery = (state: string, label?: string | null) => `?${new URLSearchParams({ state, ...(label ? { labels: label } : {}) })}`;
</script>

<script lang="ts">
	import Icon from './Icon.svelte';
	import LabelChip from './LabelChip.svelte';

	type Label = { id: number; name: string; color: string; description: string };
	let { labels, active, state: list }: { labels: Label[]; active: string | null; state: string } = $props();
	let open = $state(false);
	const current = $derived(labels.find((l) => l.name === active) ?? (active ? { name: active, color: '888888' } : undefined));
</script>

{#if labels.length || current}
	<div class="filter">
		<details bind:open>
			<summary><Icon name="filter" size={14} />{#if current}<LabelChip label={current} />{:else}Label{/if}<Icon name="chevron" size={12} /></summary>
			<ul>
				{#each labels as l (l.id)}
					<li>
						<a href={listQuery(list, l.name)} onclick={() => (open = false)}>
							<span class="tick">{#if l.name === active}<Icon name="check" size={13} />{/if}</span>
							<LabelChip label={l} />
						</a>
					</li>
				{/each}
			</ul>
		</details>
		{#if current}<a class="clear" href={listQuery(list)} title="Clear label filter" aria-label="Clear label filter"><Icon name="x" size={14} /></a>{/if}
	</div>
{/if}

<svelte:window
	onclick={(e) => {
		if (open && !(e.target as HTMLElement).closest('.filter details')) open = false;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') open = false;
	}}
/>

<style>
	.filter {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	summary {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--muted);
		font-size: 0.9rem;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover,
	details[open] summary {
		color: var(--fg);
	}
	ul {
		position: absolute;
		z-index: 10;
		top: calc(100% + 0.3rem);
		left: 0;
		min-width: 12rem;
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
	}
	ul a {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.4rem;
		border-radius: 6px;
	}
	ul a:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.tick {
		display: grid;
		place-items: center;
		width: 14px;
		color: var(--accent);
	}
	.clear {
		display: grid;
		place-items: center;
		padding: 0.3rem;
		border-radius: 6px;
		color: var(--muted);
	}
	.clear:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
</style>
