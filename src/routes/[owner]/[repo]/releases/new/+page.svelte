<script lang="ts">
	import ReleaseForm from '#lib/components/ReleaseForm.svelte';

	let { data } = $props();
</script>

<svelte:head><title>New release · {data.repo.full_name}</title></svelte:head>

<ReleaseForm release={null} tags={data.tagNames} branches={data.branches} defaultBranch={data.repo.default_branch} />
