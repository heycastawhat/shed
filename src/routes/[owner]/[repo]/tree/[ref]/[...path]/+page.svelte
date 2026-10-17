<script lang="ts">
	import { page } from '$app/state';
	import Tree from '#lib/components/Tree.svelte';

	let { data } = $props();
</script>

<Tree repo={data.repo.full_name} ref={data.ref} path={page.params.path ?? ''} entries={data.entries} readme={data.readme} />
