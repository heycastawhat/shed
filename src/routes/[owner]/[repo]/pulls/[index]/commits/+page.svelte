<script lang="ts">
	import CommitList from '#lib/components/CommitList.svelte';

	let { data } = $props();
</script>

<CommitList repo={data.repo.full_name} commits={data.commits} />
