<script lang="ts">
	import CommitList from '#lib/components/CommitList.svelte';

	let { data } = $props();
</script>

<CommitList repo={data.repo.full_name} commits={data.commits} />

{#if data.pages > 1}
	<div class="pager">
		{#if data.page > 1}<a class="button" href="?page={data.page - 1}">Newer</a>{/if}
		<span class="muted">Page {data.page} of {data.pages}</span>
		{#if data.page < data.pages}<a class="button" href="?page={data.page + 1}">Older</a>{/if}
	</div>
{/if}

<style>
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
	}
</style>
