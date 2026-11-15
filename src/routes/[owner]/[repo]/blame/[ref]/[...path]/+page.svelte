<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import CodeLines from '#lib/components/CodeLines.svelte';
	import { refPath } from '#lib/repo.js';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const path = $derived(page.params.path ?? '');
	const base = $derived(`/${data.repo.full_name}`);
	const at = $derived(Object.fromEntries(data.ranges.map((r) => [r.start, r.count])));
	const shaAt = $derived(Object.fromEntries(data.ranges.map((r) => [r.start, r.sha])));
	const authors = $derived(new Set(data.ranges.map((r) => r.sha)).size);
</script>

<svelte:head><title>Blame {path} · {data.repo.full_name}</title></svelte:head>

<Breadcrumbs repo={data.repo.full_name} ref={data.ref} {path} />

<div class="file">
	<div class="bar">
		<span>{data.html.length} line{data.html.length === 1 ? '' : 's'} · {authors} commit{authors === 1 ? '' : 's'}</span>
		<span class="actions">
			<a href="{base}/blob/{refPath(data.ref, path)}">View file</a>
			<a href="{base}/commits/{refPath(data.ref, path)}">History</a>
			<a href="{base}/blame/{refPath(data.commit, path)}">Permalink</a>
		</span>
	</div>
	<CodeLines html={data.html} gutter={{ at, cell }} />
</div>

{#snippet cell(n: number)}
	{@const c = data.commits[shaAt[n]]}
	<div class="who">
		{#if c.user}<img src={c.user.avatar_url} alt="" />{:else}<span class="initial">{c.author[0]?.toUpperCase()}</span>{/if}
		<a class="subject" href="{base}/commit/{c.sha}" title={c.summary}>{c.summary}</a>
		<span class="age muted" title={c.date}>{ago(c.date)}</span>
	</div>
	{#if at[n] > 1}<div class="when muted">{c.user?.login ?? c.author}</div>{/if}
{/snippet}

<style>
	.file {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.4rem 1rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 1rem;
	}
	.who,
	.when {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 18rem;
		min-width: 0;
	}
	.when {
		display: block;
		padding-left: 1.4rem;
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.age {
		flex: none;
		margin-left: auto;
		font-size: 0.75rem;
	}
	img,
	.initial {
		flex: none;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
	}
	.initial {
		display: grid;
		place-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 0.6rem;
		box-sizing: border-box;
	}
	.subject {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--fg);
	}
	.subject:hover {
		color: var(--accent);
	}
	@media (max-width: 700px) {
		.who,
		.when {
			width: 9rem;
		}
	}
</style>
