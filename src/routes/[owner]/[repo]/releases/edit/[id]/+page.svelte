<script lang="ts">
	import ReleaseForm from '#lib/components/ReleaseForm.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Edit {data.release.name || data.release.tag_name} · {data.repo.full_name}</title></svelte:head>

<ReleaseForm release={data.release} tags={data.tagNames} branches={data.branches} defaultBranch={data.repo.default_branch} />
