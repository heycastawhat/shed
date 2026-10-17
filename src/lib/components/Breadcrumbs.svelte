<script lang="ts">
	import { refPath } from '#lib/repo.js';

	let { repo, ref, path }: { repo: string; ref: string; path: string } = $props();
	const parts = $derived(path.split('/').filter(Boolean));
</script>

<nav class="crumbs">
	<a href="/{repo}/tree/{refPath(ref)}">{repo.split('/')[1]}</a>
	{#each parts as part, i (i)}
		<span>/</span>
		{#if i < parts.length - 1}
			<a href="/{repo}/tree/{refPath(ref, parts.slice(0, i + 1).join('/'))}">{part}</a>
		{:else}
			<strong>{part}</strong>
		{/if}
	{/each}
</nav>

<style>
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 1rem;
		font-size: 0.95rem;
	}
	span {
		color: var(--muted);
	}
</style>
