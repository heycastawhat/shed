<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';

	// Each option is a form posting `fields(option)` to `?/<action>`; `single` closes the picker after a choice.
	let {
		title,
		icon,
		action,
		can,
		options,
		on,
		fields,
		single = false,
		empty,
		row,
		shown
	}: {
		title: string;
		icon: string;
		action: string;
		can: boolean;
		options: T[];
		on: (o: T) => boolean;
		fields: (o: T) => [string, string | number][];
		single?: boolean;
		empty: string;
		row: Snippet<[T]>;
		shown?: Snippet;
	} = $props();
	let editing = $state(false);
</script>

<section>
	<div class="side-head">
		<h3>{title}</h3>
		{#if can && options.length}
			<button class="edit" class:on={editing} onclick={() => (editing = !editing)} title="Edit {title.toLowerCase()}" aria-expanded={editing}><Icon name={editing ? 'check' : icon} size={14} /></button>
		{/if}
	</div>
	{#if editing}
		<ul class="picker">
			{#each options as o, i (i)}
				<li>
					<form
						method="POST"
						action="?/{action}"
						use:enhance={() => async ({ result, update }) => {
							await update({ reset: false });
							if (single && result.type === 'success') editing = false;
						}}
					>
						{#each fields(o) as [name, value], j (j)}<input type="hidden" {name} {value} />{/each}
						<button class:on={on(o)}>
							<span class="tick">{#if on(o)}<Icon name="check" size={13} />{/if}</span>
							{@render row(o)}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else if shown}
		{@render shown()}
	{:else}
		<p class="muted none">{empty}</p>
	{/if}
	{#if page.form?.error && page.form.action === action}<p class="error">{page.form.error}</p>{/if}
</section>

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
	.none {
		margin: 0;
		font-size: 0.85rem;
	}
	.picker {
		list-style: none;
		padding: 0.25rem;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
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
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
