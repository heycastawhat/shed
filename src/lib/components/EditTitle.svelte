<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';

	let { title, number, can, action }: { title: string; number: number; can: boolean; action: string } = $props();
	let editing = $state(false);
	let busy = $state(false);
</script>

{#if editing}
	<form
		method="POST"
		{action}
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
				busy = false;
			};
		}}
	>
		<input
			name="title"
			value={title}
			aria-label="Title"
			{@attach (el) => el.select()}
			onkeydown={(e) => {
				if (e.key === 'Escape') editing = false;
			}}
		/>
		<button class="primary" disabled={busy}>Save</button>
		<button type="button" onclick={() => (editing = false)}>Cancel</button>
		{#if page.form?.error && page.form.action === 'title'}<span class="error">{page.form.error}</span>{/if}
	</form>
{:else}
	<h2>
		{title} <span class="muted">#{number}</span>
		{#if can}<button class="pencil" onclick={() => (editing = true)} title="Edit title"><Icon name="pencil" size={15} /></button>{/if}
	</h2>
{/if}

<style>
	h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 600;
	}
	h2 .muted {
		font-weight: 400;
	}
	.pencil {
		display: inline-grid;
		place-items: center;
		padding: 0.2rem;
		vertical-align: middle;
		border-color: transparent;
		background: none;
		color: var(--muted);
	}
	.pencil:hover {
		color: var(--accent);
	}
	form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	input {
		flex: 1;
		min-width: 0;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 1.3rem;
		font-weight: 600;
	}
	input:focus {
		outline: none;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
