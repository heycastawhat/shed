<script lang="ts">
	import RepoList from '#lib/components/RepoList.svelte';

	let { data } = $props();
	const o = $derived(data.owner);
	const joined = $derived(new Date(o.created).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }));
</script>

<svelte:head><title>{o.full_name || o.login}</title></svelte:head>

<header>
	<img src={o.avatar_url} alt="" />
	<div>
		<h1>{o.full_name || o.login}{#if data.members}<span class="tag">Organization</span>{/if}</h1>
		{#if o.full_name}<div class="muted">{o.login}</div>{/if}
		{#if o.description}<p>{o.description}</p>{/if}
		<div class="muted meta">
			{#if o.location}<span>{o.location}</span>{/if}
			{#if o.website}<a href={o.website} rel="noreferrer">{o.website.replace(/^https?:\/\//, '')}</a>{/if}
			<span>Joined {joined}</span>
		</div>
	</div>
</header>

{#if data.members?.length}
	<h2>Members</h2>
	<div class="members">
		{#each data.members as m (m.id)}<a href="/{m.login}" title={m.login}><img src={m.avatar_url} alt={m.login} /></a>{/each}
	</div>
{/if}

<h2>Repositories</h2>
<RepoList repos={data.repos} pins={data.pins}>
	<strong>No repositories you can see.</strong>
</RepoList>

<style>
	header {
		display: flex;
		gap: 1.25rem;
		align-items: center;
	}
	header img {
		width: 72px;
		height: 72px;
		border-radius: 50%;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	header p {
		margin: 0.4rem 0 0;
	}
	.meta {
		display: flex;
		gap: 1rem;
		margin-top: 0.4rem;
		font-size: 0.85rem;
	}
	h2 {
		margin: 2rem 0 0;
		font-size: 1rem;
	}
	.members {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}
	.members img {
		width: 32px;
		height: 32px;
		border-radius: 50%;
	}
</style>
