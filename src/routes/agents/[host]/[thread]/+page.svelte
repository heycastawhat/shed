<script lang="ts">
	import TaskView from '#lib/components/TaskView.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>{data.thread.title} · Agents · forge</title></svelte:head>

<nav class="crumbs"><a href="/agents">Agents</a> / {data.repo ?? `${data.project} (T3 only)`}</nav>
<TaskView thread={data.thread} items={data.items} pending={data.pending} models={data.models} {form} repo={data.repo} />

<style>
	.crumbs {
		margin-bottom: 1rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
</style>
