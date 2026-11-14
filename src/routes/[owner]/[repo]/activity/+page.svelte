<script lang="ts">
	import ActivityFeed from '#lib/components/ActivityFeed.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Activity · {data.repo.full_name}</title></svelte:head>

{#if data.feed.length}
	<ActivityFeed feed={data.feed} repo />
{:else}
	<p class="muted empty">No activity yet.</p>
{/if}

<style>
	.empty {
		padding: 2rem 0;
		text-align: center;
	}
</style>
