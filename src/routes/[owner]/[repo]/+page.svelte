<script lang="ts">
	import Tree from '#lib/components/Tree.svelte';

	let { data } = $props();
</script>

<Tree repo={data.repo.full_name} ref={data.ref} path="" entries={data.entries} last={data.last} readme={data.readme} />
