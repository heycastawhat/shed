<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import { page } from '$app/state';
	import CloneMenu from './CloneMenu.svelte';
	import Icon from './Icon.svelte';
	import { refPath } from '#lib/repo.js';
	import { ago } from '#lib/time.js';

	type Entry = { name: string; path: string; type: string; last_commit_sha?: string };
	let {
		repo,
		ref,
		path,
		entries,
		last,
		readme,
		canEdit = false
	}: {
		repo: string;
		ref: string;
		path: string;
		entries: Entry[];
		last: Record<string, { title: string; date: string }>;
		readme?: { name: string; html: string };
		canEdit?: boolean;
	} = $props();

	let menu = $state<HTMLDetailsElement>();
	const parent = $derived(path.split('/').filter(Boolean).slice(0, -1).join('/'));
	const href = (e: Entry) => `/${repo}/${e.type === 'dir' ? 'tree' : 'blob'}/${refPath(ref, e.path)}`;
</script>

<div class="tools">
	{#if path}<Breadcrumbs {repo} {ref} {path} />{/if}
	<span class="buttons">
		<button class="button" onclick={() => dispatchEvent(new Event('gotofile'))} title="Go to file (t)"><Icon name="search" size={14} />Go to file</button>
		<a class="button" href="/{repo}/commits/{refPath(ref, path)}" title="History of this folder"><Icon name="history" size={14} />History</a>
		{#if canEdit}
			<details class="add" bind:this={menu}>
				<summary class="button"><Icon name="plus" size={14} />Add file<Icon name="chevron" size={12} /></summary>
				<div class="menu">
					<a href="/{repo}/new/{refPath(ref, path)}"><Icon name="file" size={14} />New file</a>
					<a href="/{repo}/upload/{refPath(ref, path)}"><Icon name="upload" size={14} />Upload files</a>
				</div>
			</details>
		{/if}
		{#if !path && page.data.repo}<CloneMenu {repo} {ref} https={page.data.repo.clone_url} ssh={page.data.repo.ssh_url} />{/if}
	</span>
</div>

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
			{#if e.last_commit_sha && last[e.last_commit_sha]}
				{@const c = last[e.last_commit_sha]}
				<a class="msg" href="/{repo}/commit/{e.last_commit_sha}">{c.title}</a>
				<span class="when" title={c.date}>{ago(c.date)}</span>
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

<svelte:window onclick={(e) => menu?.open && !menu.contains(e.target as Node) && (menu.open = false)} />

<style>
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.6rem 1rem;
		margin-bottom: 1rem;
	}
	.tools :global(.crumbs) {
		margin: 0.3rem 0 0;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-left: auto;
	}
	.buttons .button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.65rem;
		color: var(--fg);
		font-size: 0.85rem;
	}
	.add {
		position: relative;
	}
	.add summary {
		list-style: none;
	}
	.add summary::-webkit-details-marker {
		display: none;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.3rem);
		z-index: 10;
		display: grid;
		min-width: 10rem;
		padding: 0.3rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
	}
	.menu a {
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		font-size: 0.88rem;
	}
	.menu a:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.tree,
	.readme {
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.tree {
		list-style: none;
		padding: 0;
		margin: 0;
		overflow: hidden;
		font-size: 0.92rem;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) 9rem;
		align-items: center;
	}
	li > :first-child:last-child {
		grid-column: 1 / -1;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li:hover {
		background: var(--surface);
	}
	.msg,
	.when {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.msg {
		display: block;
		padding: 0.5rem 1rem 0.5rem 0;
	}
	.msg:hover {
		color: var(--accent);
	}
	.when {
		padding-right: 1rem;
		text-align: right;
	}
	a,
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem;
		color: var(--fg);
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
	@media (max-width: 700px) {
		li {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.msg {
			display: none;
		}
		a {
			overflow-wrap: anywhere;
		}
		.markdown {
			padding: 1rem;
		}
	}
</style>
