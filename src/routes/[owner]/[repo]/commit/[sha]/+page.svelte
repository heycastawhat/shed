<script lang="ts">
	import DiffView from '#lib/components/DiffView.svelte';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const [title, ...body] = $derived(data.commit.commit.message.trim().split('\n'));
</script>

<svelte:head><title>{title} · {data.commit.sha.slice(0, 8)} · {data.repo.full_name}</title></svelte:head>

<div class="commit">
	<h2>{title}</h2>
	{#if body.join('').trim()}<pre>{body.join('\n').trim()}</pre>{/if}
	<div class="meta">
		{#if data.commit.author}<img src={data.commit.author.avatar_url} alt="" />{/if}
		<span>{data.commit.author?.login ?? data.commit.commit.author.name}</span>
		<span title={data.commit.commit.author.date}>committed {ago(data.commit.commit.author.date)}</span>
		<span class="shas">
			{#each data.commit.parents as p (p.sha)}
				parent <a href="/{data.repo.full_name}/commit/{p.sha}"><code>{p.sha.slice(0, 8)}</code></a>
			{/each}
			<code>{data.commit.sha.slice(0, 8)}</code>
		</span>
	</div>
</div>

<DiffView files={data.files} source="/{data.repo.full_name}/lines/{data.commit.sha}" />

<style>
	.commit {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		margin-bottom: 1.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.1rem;
		overflow-wrap: anywhere;
	}
	pre {
		white-space: pre-wrap;
		color: var(--muted);
		margin: 0.6rem 0 0;
		font-size: 0.9rem;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.8rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	img {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}
	.shas {
		margin-left: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
	code {
		font-family: var(--mono);
	}
</style>
