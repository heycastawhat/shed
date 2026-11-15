<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Fork {data.repo.full_name}</title></svelte:head>

<form
	method="POST"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<h2><Icon name="fork" size={18} />Fork {data.repo.full_name}</h2>
	<p class="muted">A fork is your own copy of every branch and tag, linked back here so you can open pull requests against it.{#if data.repo.private} It stays private, like this one.{/if}</p>
	<div class="where">
		<label>
			<span>Owner</span>
			<select name="owner" value={form?.owner ?? data.owners[0]}>
				{#each data.owners as o (o)}<option>{o}</option>{/each}
			</select>
		</label>
		<span class="slash">/</span>
		<label>
			<span>Name</span>
			<input name="name" value={form?.name ?? data.repo.name} required spellcheck="false" />
		</label>
	</div>
	<div class="bar">
		{#if form?.error}<span class="error">{form.error}</span>{/if}
		<a class="button" href="/{data.repo.full_name}">Cancel</a>
		<button class="primary" disabled={busy}>{busy ? 'Forking…' : 'Fork'}</button>
	</div>
</form>

<style>
	form {
		display: grid;
		gap: 1rem;
		max-width: 40rem;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1.2rem;
	}
	p {
		margin: 0;
	}
	.where {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.5fr);
		align-items: end;
		gap: 0.5rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		font-size: 0.85rem;
		font-weight: 600;
	}
	select,
	input {
		min-width: 0;
		font: inherit;
		font-weight: 400;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.slash {
		padding-bottom: 0.4rem;
		color: var(--muted);
		font-size: 1.2rem;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.6rem;
	}
	.error {
		margin-right: auto;
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
