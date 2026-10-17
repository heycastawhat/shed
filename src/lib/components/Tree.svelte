<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import Icon from './Icon.svelte';
	import { refPath } from '#lib/repo.js';

	type Entry = { name: string; path: string; type: string };
	let {
		repo,
		ref,
		path,
		entries,
		readme
	}: { repo: string; ref: string; path: string; entries: Entry[]; readme?: { name: string; html: string } } = $props();

	const parent = $derived(path.split('/').filter(Boolean).slice(0, -1).join('/'));
	const href = (e: Entry) => `/${repo}/${e.type === 'dir' ? 'tree' : 'blob'}/${refPath(ref, e.path)}`;
</script>

{#if path}<Breadcrumbs {repo} {ref} {path} />{/if}

<ul class="tree">
	{#if path}
		<li><a href="/{repo}/tree/{refPath(ref, parent)}"><span class="icon"><Icon name="folder" size={15} /></span>..</a></li>
	{/if}
	{#each entries as e (e.path)}
		<li>
			{#if e.type === 'submodule'}
				<span class="row"><span class="icon"><Icon name="commit" size={15} /></span>{e.name}</span>
			{:else}
				<a href={href(e)} class:dir={e.type === 'dir'}><span class="icon"><Icon name={e.type === 'dir' ? 'folder' : 'file'} size={15} /></span>{e.name}</a>
			{/if}
		</li>
	{/each}
</ul>

{#if readme}
	<section class="readme">
		<h2>{readme.name}</h2>
		<article class="markdown">{@html readme.html}</article>
	</section>
{/if}

<style>
	.tree,
	.readme {
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.tree {
		list-style: none;
		padding: 0;
		margin: 0;
		overflow: hidden;
		font-size: 0.92rem;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	a,
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem;
		color: var(--fg);
	}
	a:hover {
		background: var(--surface);
	}
	.icon {
		display: flex;
		color: var(--muted);
	}
	.dir .icon {
		color: var(--accent);
	}
	.readme {
		margin-top: 1.5rem;
	}
	h2 {
		margin: 0;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.markdown {
		padding: 1.5rem 2rem;
	}
</style>
