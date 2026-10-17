<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';
	import LabelChip from './LabelChip.svelte';

	type Label = { id: number; name: string; color: string; description: string };
	let { labels, current, can }: { labels: Label[]; current: Label[]; can: boolean } = $props();
	const has = $derived(new Set(current.map((l) => l.id)));
	let editing = $state(false);
</script>

<div class="side-head">
	<h3>Labels</h3>
	{#if can && labels.length}
		<button class="edit" class:on={editing} onclick={() => (editing = !editing)} title="Edit labels" aria-expanded={editing}><Icon name={editing ? 'check' : 'tag'} size={14} /></button>
	{/if}
</div>
{#if editing}
	<ul class="picker">
		{#each labels as l (l.id)}
			<li>
				<form method="POST" action="?/label" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<input type="hidden" name="id" value={l.id} />
					{#if has.has(l.id)}<input type="hidden" name="remove" />{/if}
					<button class:on={has.has(l.id)}>
						<span class="tick">{#if has.has(l.id)}<Icon name="check" size={13} />{/if}</span>
						<LabelChip label={l} />
						{#if l.description}<span class="muted desc">{l.description}</span>{/if}
					</button>
				</form>
			</li>
		{/each}
	</ul>
{:else if current.length}
	<div class="chips">{#each current as l (l.id)}<LabelChip label={l} />{/each}</div>
{:else}
	<p class="muted none">{labels.length ? 'None yet' : 'This repo has no labels'}</p>
{/if}
{#if page.form?.error && page.form.action === 'label'}<p class="error">{page.form.error}</p>{/if}

<style>
	.side-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.4rem;
		margin-bottom: 0.6rem;
		border-bottom: 1px solid var(--border);
	}
	h3 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.edit {
		display: grid;
		place-items: center;
		padding: 0.2rem;
		border-color: transparent;
		background: none;
		color: var(--muted);
	}
	.edit:hover,
	.edit.on {
		color: var(--accent);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.none {
		margin: 0;
		font-size: 0.85rem;
	}
	.picker {
		list-style: none;
		padding: 0.25rem;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
	.picker button {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.4rem;
		width: 100%;
		padding: 0.35rem 0.4rem;
		border: 0;
		background: none;
		text-align: left;
	}
	.picker button:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.tick {
		display: grid;
		place-items: center;
		width: 14px;
		color: var(--accent);
	}
	.desc {
		flex-basis: 100%;
		padding-left: calc(14px + 0.4rem);
		font-size: 0.75rem;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
