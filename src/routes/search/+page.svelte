<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import RepoList from '#lib/components/RepoList.svelte';
	import { refPath } from '#lib/repo.js';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const tabs = $derived([
		['issues', 'Issues and PRs', 'issue', data.issueTotal],
		['code', 'Code', 'code', data.code.length],
		['repos', 'Repositories', 'repos', data.repos.length]
	] as const);
	const q = $derived(encodeURIComponent(data.q));
	// Code lines come back as plain text; mark the matches without {@html}.
	const parts = (text: string) => {
		const at: { s: string; hit: boolean }[] = [];
		const lower = text.toLowerCase();
		const needle = data.q.toLowerCase();
		let i = 0;
		for (let j = lower.indexOf(needle); needle && j >= 0; j = lower.indexOf(needle, i)) {
			at.push({ s: text.slice(i, j), hit: false }, { s: text.slice(j, j + needle.length), hit: true });
			i = j + needle.length;
		}
		return [...at, { s: text.slice(i), hit: false }];
	};
	const icon = (i: { state: string; pull_request: { merged: boolean } | null }) => (i.pull_request ? (i.pull_request.merged ? 'merge' : 'changes') : i.state === 'closed' ? 'done' : 'issue');
</script>

<svelte:head><title>{data.q ? `${data.q} · Search` : 'Search'}</title></svelte:head>

<form class="find" method="GET">
	<Icon name="search" size={16} />
	<input name="q" value={data.q} placeholder="Search issues, pull requests, code and repositories" aria-label="Search" {@attach (el) => {
		if (!data.q) el.focus();
	}} />
	{#if data.tab !== 'issues'}<input type="hidden" name="type" value={data.tab} />{/if}
	<button class="primary">Search</button>
</form>

{#if data.q}
	<div class="filters">
		{#each tabs as [t, label, ic, n] (t)}
			<a href="?q={q}{t === 'issues' ? '' : `&type=${t}`}" class:on={data.tab === t}><Icon name={ic} size={14} />{label}<span class="n">{n}</span></a>
		{/each}
	</div>

	{#if data.tab === 'issues'}
		<ul class="list">
			{#each data.issues as i (`${i.repository.full_name}#${i.number}`)}
				<li>
					<span class="kind {i.pull_request?.merged ? 'merged' : i.state}"><Icon name={icon(i)} size={16} /></span>
					<div>
						<a href="/{i.repository.full_name}/{i.pull_request ? 'pulls' : 'issues'}/{i.number}"><strong>{i.title}</strong></a>
						<div class="muted meta">{i.repository.full_name}#{i.number} · {i.user.login} · updated {ago(i.updated_at)}</div>
					</div>
				</li>
			{:else}
				<li class="empty muted">No issues or pull requests mention “{data.q}”.</li>
			{/each}
		</ul>
		{#if data.issueTotal > data.issues.length}<p class="muted more">Showing the {data.issues.length} most recently updated of {data.issueTotal}.</p>{/if}
	{:else if data.tab === 'code'}
		<ul class="list code">
			{#each data.code as h, k (k)}
				<li>
					<div class="where">
						<a href="/{h.repo}">{h.repo}</a> · <a href="/{h.repo}/blob/{refPath(h.ref, h.path)}#L{h.line}">{h.path}</a>
					</div>
					<pre><span class="ln">{h.line}</span>{#each parts(h.text) as p, x (x)}{#if p.hit}<mark>{p.s}</mark>{:else}{p.s}{/if}{/each}</pre>
				</li>
			{:else}
				<li class="empty muted">No code on a default branch contains “{data.q}”.</li>
			{/each}
		</ul>
		{#if data.code.length >= 100}<p class="muted more">Showing the first 100 matches.</p>{/if}
	{:else}
		<RepoList repos={data.repos} pins={data.pins}><span class="muted">No repositories match “{data.q}”.</span></RepoList>
	{/if}
{:else}
	<p class="muted">Search titles and descriptions of issues and pull requests, code on default branches, and repository names.</p>
{/if}

<style>
	.find {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.25rem 0.25rem 0.25rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--muted);
	}
	.find:focus-within {
		border-color: var(--accent);
	}
	.find input {
		flex: 1;
		min-width: 0;
		padding: 0.4rem 0;
		border: 0;
		background: none;
		color: var(--fg);
		font: inherit;
		font-size: 1rem;
	}
	.find input:focus {
		outline: none;
	}
	.filters {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin-bottom: 0.9rem;
		padding: 0.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
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
	.n {
		font-size: 0.75rem;
		padding: 0 0.4rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.list li {
		display: flex;
		gap: 0.75rem;
		padding: 0.65rem 1rem;
		min-width: 0;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li > div {
		min-width: 0;
	}
	.list strong {
		color: var(--fg);
	}
	.meta {
		font-size: 0.8rem;
	}
	.kind {
		padding-top: 0.15rem;
		color: var(--accent);
	}
	.kind.closed {
		color: var(--del-fg);
	}
	.code li {
		display: block;
	}
	.where {
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
	pre {
		margin: 0.35rem 0 0;
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		background: var(--surface);
		font-family: var(--mono);
		font-size: 0.8rem;
		overflow-x: auto;
	}
	.ln {
		display: inline-block;
		min-width: 2.5rem;
		margin-right: 0.75rem;
		color: var(--muted);
		text-align: right;
		user-select: none;
	}
	mark {
		background: color-mix(in srgb, var(--warn) 35%, transparent);
		color: inherit;
		border-radius: 2px;
	}
	.empty {
		justify-content: center;
		padding: 2rem !important;
	}
	.more {
		font-size: 0.85rem;
	}
</style>
