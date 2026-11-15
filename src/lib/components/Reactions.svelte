<script lang="ts" module>
	export const EMOJI: Record<string, string> = { '+1': '👍', '-1': '👎', laugh: '😄', hooray: '🎉', confused: '😕', heart: '❤️', rocket: '🚀', eyes: '👀' };
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from './Icon.svelte';

	type Reaction = { content: string; users: string[]; mine: boolean };
	// `id` is the comment's; without one the reactions are on the issue or PR itself.
	let { reactions, id, can }: { reactions: Reaction[]; id?: number; can: boolean } = $props();
	let picker = $state<HTMLDetailsElement>();
	const who = (r: Reaction) => (r.users.length > 3 ? `${r.users.slice(0, 3).join(', ')} and ${r.users.length - 3} more` : r.users.join(', ')) + ` reacted with ${r.content}`;
	const mine = $derived(new Set(reactions.filter((r) => r.mine).map((r) => r.content)));
	const submit = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
		if (picker) picker.open = false;
		await update({ reset: false });
	};
</script>

{#if reactions.length || can}
	<div class="reactions">
		{#each reactions as r (r.content)}
			<form method="POST" action="?/react" use:enhance={submit}>
				{#if id}<input type="hidden" name="id" value={id} />{/if}
				<input type="hidden" name="content" value={r.content} />
				{#if r.mine}<input type="hidden" name="remove" />{/if}
				<button class="pill" class:mine={r.mine} title={who(r)} disabled={!can}>{EMOJI[r.content] ?? r.content}<span>{r.users.length}</span></button>
			</form>
		{/each}
		{#if can}
			<details class="add" bind:this={picker}>
				<summary title="Add a reaction" aria-label="Add a reaction"><Icon name="emoji" size={15} /></summary>
				<div class="menu">
					{#each Object.entries(EMOJI) as [content, e] (content)}
						<form method="POST" action="?/react" use:enhance={submit}>
							{#if id}<input type="hidden" name="id" value={id} />{/if}
							<input type="hidden" name="content" value={content} />
							{#if mine.has(content)}<input type="hidden" name="remove" />{/if}
							<button class:mine={mine.has(content)} title={content} aria-label={content}>{e}</button>
						</form>
					{/each}
				</div>
			</details>
		{/if}
	</div>
{/if}

<svelte:window onclick={(e) => picker?.open && !picker.contains(e.target as Node) && (picker.open = false)} />

<style>
	.reactions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		padding: 0 1rem 0.75rem;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		font-size: 0.85rem;
		background: var(--surface);
	}
	.pill span {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.mine {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}
	.pill.mine span {
		color: var(--accent);
	}
	.add {
		position: relative;
	}
	summary {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.6rem;
		border-radius: 999px;
		color: var(--muted);
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover,
	.add[open] summary {
		color: var(--accent);
		background: var(--surface);
	}
	.menu {
		position: absolute;
		z-index: 20;
		bottom: calc(100% + 0.3rem);
		left: 0;
		display: flex;
		gap: 0.15rem;
		padding: 0.3rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
	}
	.menu button {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-color: transparent;
		background: none;
		font-size: 1.05rem;
	}
	.menu button:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
</style>
