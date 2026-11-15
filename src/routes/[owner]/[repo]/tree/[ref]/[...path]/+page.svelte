<script lang="ts">
	import { page } from '$app/state';
	import Tree from '#lib/components/Tree.svelte';

	let { data } = $props();
</script>

<Tree repo={data.repo.full_name} ref={data.ref} path={page.params.path ?? ''} entries={data.entries} last={data.last} readme={data.readme} canEdit={data.repo.permissions.push && data.branches.includes(data.ref)} />
