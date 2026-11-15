<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import CommitList from '#lib/components/CommitList.svelte';

	let { data } = $props();
	const path = $derived(page.params.path ?? '');
</script>

<svelte:head>{#if path}<title>History of {path} · {data.repo.full_name}</title>{/if}</svelte:head>

{#if path}
	<div class="history">
		<Breadcrumbs repo={data.repo.full_name} ref={data.ref} {path} />
		<span class="muted">{data.total} commit{data.total === 1 ? '' : 's'}</span>
	</div>
{/if}

{#if data.commits.length}
	<CommitList repo={data.repo.full_name} commits={data.commits} />
{:else}
	<p class="muted">No commits touch {path} on {data.ref}.</p>
{/if}

{#if data.pages > 1}
	<div class="pager">
		{#if data.page > 1}<a class="button" href="?page={data.page - 1}">Newer</a>{/if}
		<span class="muted">Page {data.page} of {data.pages}</span>
		{#if data.page < data.pages}<a class="button" href="?page={data.page + 1}">Older</a>{/if}
	</div>
{/if}

<style>
	.history {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 1rem;
	}
	.history :global(.crumbs) {
		margin-bottom: 1rem;
	}
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
	}
</style>
