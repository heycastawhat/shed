<script lang="ts">
	import SplitPane from '#lib/components/SplitPane.svelte';

	let { data, children } = $props();
</script>

<SplitPane list={data.split} kind="issues" repo={data.repo.full_name}>{@render children()}</SplitPane>
