<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import RepoList from '#lib/components/RepoList.svelte';

	let { data } = $props();
	const tabs = [
		['repos', 'Repositories', 'repos'],
		['users', 'People', 'user'],
		['orgs', 'Organisations', 'group']
	] as const;
	const href = (tab: string) => (tab === 'repos' ? '?' : `?tab=${tab}`) + (data.q ? `${tab === 'repos' ? '' : '&'}q=${encodeURIComponent(data.q)}` : '');
</script>

<svelte:head><title>Explore</title></svelte:head>

<h1>Explore</h1>
<div class="top">
	<div class="filters">
		{#each tabs as [t, label, icon] (t)}<a href={href(t)} class:on={data.tab === t}><Icon name={icon} size={14} />{label}</a>{/each}
	</div>
	<form class="find" method="GET">
		{#if data.tab !== 'repos'}<input type="hidden" name="tab" value={data.tab} />{/if}
		<Icon name="search" size={15} />
		<input name="q" value={data.q} placeholder="Filter {data.tab === 'repos' ? 'repositories' : data.tab === 'orgs' ? 'organisations' : 'people'}…" aria-label="Filter" />
	</form>
	<a class="muted code" href="/search{data.q ? `?q=${encodeURIComponent(data.q)}` : ''}">Search issues, PRs and code →</a>
</div>

{#if data.tab === 'repos'}
	<RepoList repos={data.repos} pins={data.pins}>
		<strong>{data.q ? `No repositories match “${data.q}”` : 'No repositories yet.'}</strong>
	</RepoList>
{:else}
	<ul class="people">
		{#each data.people as u (u.id)}
			<li>
				<a href="/{u.login}"><img src={u.avatar_url} alt="" /><strong>{u.login}</strong>{#if u.full_name}<span class="muted">{u.full_name}</span>{/if}</a>
			</li>
		{:else}
			<li class="empty muted">{data.q ? `No one matches “${data.q}”` : 'No one here yet.'}</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		margin: 0 0 1rem;
		font-size: 1.4rem;
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.filters {
		display: inline-flex;
		gap: 0.2rem;
		padding: 0.2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.filters a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.7rem;
		border-radius: 6px;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.filters a.on {
		background: var(--bg);
		color: var(--fg);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
	}
	.find {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex: 1;
		min-width: 12rem;
		padding: 0 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--muted);
	}
	.find:focus-within {
		border-color: var(--accent);
	}
	.find input {
		flex: 1;
		min-width: 0;
		padding: 0.45rem 0;
		border: 0;
		background: none;
		color: var(--fg);
		font: inherit;
	}
	.find input:focus {
		outline: none;
	}
	.code {
		font-size: 0.85rem;
	}
	.people {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.6rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.people a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--fg);
	}
	.people a:hover {
		border-color: var(--accent);
	}
	.people img {
		width: 32px;
		height: 32px;
		border-radius: 50%;
	}
	.people .muted {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.85rem;
	}
	.empty {
		grid-column: 1 / -1;
		padding: 2rem;
		text-align: center;
	}
</style>
