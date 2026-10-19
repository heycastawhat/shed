<script lang="ts">
	import { page } from '$app/state';
	import type { Label, Milestone } from '#lib/server/forgejo.js';
	import { listQuery } from '#lib/list-query.js';
	import Icon from './Icon.svelte';
	import LabelChip from './LabelChip.svelte';

	let {
		labels,
		milestones,
		label,
		milestone,
		assignee,
		me
	}: { labels: Label[]; milestones: Milestone[]; label: string | null; milestone: string | null; assignee: string | null; me?: string } = $props();
	const q = (set: Record<string, string | null>) => listQuery(page.url, set);
	const chip = $derived(labels.find((l) => l.name === label) ?? (label ? { name: label, color: '888888' } : undefined));
	let root: HTMLElement;
</script>

<div class="bar" bind:this={root}>
	{#if labels.length || label}
		<div class="menu">
			<details>
				<summary><Icon name="tag" size={14} />{#if chip}<LabelChip label={chip} />{:else}Label{/if}<Icon name="chevron" size={12} /></summary>
				<ul>
					{#each labels as l (l.id)}
						<li><a href={q({ labels: l.name })}><span class="tick">{#if l.name === label}<Icon name="check" size={13} />{/if}</span><LabelChip label={l} /></a></li>
					{/each}
				</ul>
			</details>
			{#if label}<a class="clear" href={q({ labels: null })} title="Clear label filter" aria-label="Clear label filter"><Icon name="x" size={14} /></a>{/if}
		</div>
	{/if}
	{#if milestones.length || milestone}
		<div class="menu">
			<details>
				<summary class:set={milestone}><Icon name="milestone" size={14} />{milestone ?? 'Milestone'}<Icon name="chevron" size={12} /></summary>
				<ul>
					{#each milestones as m (m.id)}
						<li>
							<a href={q({ milestone: m.title })}>
								<span class="tick">{#if m.title === milestone}<Icon name="check" size={13} />{/if}</span>{m.title}
								{#if m.state === 'closed'}<span class="muted small">closed</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			</details>
			{#if milestone}<a class="clear" href={q({ milestone: null })} title="Clear milestone filter" aria-label="Clear milestone filter"><Icon name="x" size={14} /></a>{/if}
		</div>
	{/if}
	{#if me}
		<a class="toggle" class:set={assignee} href={q({ assignee: assignee ? null : me })} title={assignee ? 'Clear assignee filter' : undefined}>
			<Icon name="user" size={14} />{assignee && assignee !== me ? `Assigned to ${assignee}` : 'Assigned to me'}{#if assignee}<Icon name="x" size={12} />{/if}
		</a>
	{/if}
</div>

<svelte:window
	onclick={(e) => {
		for (const d of root.querySelectorAll('details[open]')) if (!d.contains(e.target as Node) || (e.target as HTMLElement).closest('ul a')) d.removeAttribute('open');
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') for (const d of root.querySelectorAll('details[open]')) d.removeAttribute('open');
	}}
/>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.menu {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	summary,
	.toggle {
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
		white-space: nowrap;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover,
	details[open] summary,
	.toggle:hover,
	.set {
		color: var(--fg);
	}
	.toggle.set {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
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
		color: var(--fg);
	}
	ul a:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.small {
		margin-left: auto;
		font-size: 0.75rem;
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
