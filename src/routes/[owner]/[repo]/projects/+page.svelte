<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';

	let { data, form } = $props();
	const base = $derived(`/${data.repo.full_name}/projects`);
	let creating = $state(false);
</script>

<svelte:head><title>Projects · {data.repo.full_name}</title></svelte:head>

<div class="top">
	<h2>Projects</h2>
	{#if data.repo.permissions.push}<button class="primary" onclick={() => (creating = !creating)}>New project</button>{/if}
</div>

{#if creating}
	<form class="new" method="POST" action="?/create" use:enhance>
		<input name="title" placeholder="Title" required {@attach (el) => el.focus()} />
		<input name="description" placeholder="What it's for (optional)" />
		<button class="primary">Create</button>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	</form>
{/if}

<ul class="list">
	{#each data.projects as p (p.id)}
		<li>
			<Icon name="board" size={16} />
			<div>
				<a href="{base}/{p.id}"><strong>{p.title}</strong></a>
				{#if p.description}<span class="muted">{p.description}</span>{/if}
			</div>
			{#if p.state === 'closed'}<span class="tag">closed</span>{/if}
			<span class="progress" title="{p.done} of {p.cards} cards' issues closed"><span style:width="{p.cards ? (p.done / p.cards) * 100 : 0}%"></span></span>
			<span class="muted small">{p.done}/{p.cards}</span>
		</li>
	{:else}
		<li class="muted">No projects yet. A project is a board of issues and notes in columns.</li>
	{/each}
</ul>

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	h2 {
		margin: 0;
	}
	.new {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.new input {
		flex: 1;
		min-width: 0;
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.75rem 1rem;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li > div {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.progress {
		width: 6rem;
		height: 0.4rem;
		border-radius: 999px;
		background: var(--border);
		overflow: hidden;
	}
	.progress span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.tag {
		font-size: 0.75rem;
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--muted);
	}
	.small {
		font-size: 0.85rem;
	}
	.error {
		color: var(--del-fg);
		width: 100%;
	}
</style>
