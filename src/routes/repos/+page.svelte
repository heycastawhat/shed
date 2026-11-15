<script lang="ts">
	import RepoList from '#lib/components/RepoList.svelte';

	let { data } = $props();
</script>

<div class="head">
	<h1>Repositories</h1>
	<div class="new">
		<a class="button" href="/orgs/new">New organization</a>
		<a class="button primary" href="/new">New repository</a>
	</div>
</div>

<RepoList repos={data.repos} pins={data.pins}>
	<strong>No repositories yet.</strong>
	<p>Create one and push to it, or start from a README.</p>
	<a class="button primary" href="/new">New repository</a>
</RepoList>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.head h1 {
		margin: 0;
	}
	.new {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 0.5rem;
	}
	.button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		font-weight: 600;
	}
</style>
