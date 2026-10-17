<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import { refPath } from '#lib/repo.js';

	let { data, children } = $props();
	const base = $derived(`/${data.repo.full_name}`);
	const pinned = $derived(data.pins.includes(data.repo.full_name));
	let proto = $state<'ssh' | 'https'>('ssh');
	const url = $derived(proto === 'ssh' ? data.repo.ssh_url : data.repo.clone_url);
	const section = $derived(
		page.route.id?.includes('/pulls') ? 'pulls' : page.route.id?.includes('/issues') ? 'issues' : page.route.id?.endsWith('/agents') ? 'agents' : /\/commits?\//.test(page.route.id ?? '') ? 'commits' : 'code'
	);

	function switchRef(ref: string) {
		const path = page.params.path ?? '';
		const kind = page.route.id?.match(/\/(tree|blob|commits)\//)?.[1] ?? 'tree';
		goto(`${base}/${kind}/${refPath(ref, kind === 'commits' ? '' : path)}`);
	}
</script>

<div class="head">
	<h1>
		<a class="owner" href="/{data.repo.owner.login}">{data.repo.owner.login}</a><span class="sep">/</span><a class="name" href={base}>{data.repo.name}</a>
		{#if data.repo.private}<span class="private"><Icon name="lock" size={12} />Private</span>{/if}
		<form class="pin" method="POST" action="/pin">
			<input type="hidden" name="repo" value={data.repo.full_name} />
			<input type="hidden" name="pin" value={pinned ? '0' : '1'} />
			<button class:on={pinned} title={pinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'}><Icon name="pin" size={13} />{pinned ? 'Pinned' : 'Pin'}</button>
		</form>
	</h1>
	{#if data.repo.description}<p>{data.repo.description}</p>{/if}
	<nav>
		<a href={base} class:active={section === 'code'}><Icon name="code" size={15} />Code</a>
		<a href="{base}/commits/{refPath(data.ref)}" class:active={section === 'commits'}><Icon name="commit" size={15} />Commits</a>
		<a href="{base}/pulls" class:active={section === 'pulls'}>
			<Icon name="changes" size={15} />Pull requests{#if data.repo.open_pr_counter}<span class="count">{data.repo.open_pr_counter}</span>{/if}
		</a>
		{#if data.repo.has_issues}
			<a href="{base}/issues" class:active={section === 'issues'}>
				<Icon name="issue" size={15} />Issues{#if data.repo.open_issues_count}<span class="count">{data.repo.open_issues_count}</span>{/if}
			</a>
		{/if}
		{#if data.agents}<a href="{base}/agents" class:active={section === 'agents'}><Icon name="agents" size={15} />Agents</a>{/if}
		{#if data.branches.length && (section === 'code' || section === 'commits')}
			<label class="branch">
				<Icon name="branch" size={14} />
				<span class="cur">{data.ref}</span>
				<select value={data.ref} onchange={(e) => switchRef(e.currentTarget.value)} aria-label="Branch">
					{#each data.branches as b (b)}<option>{b}</option>{/each}
				</select>
				<Icon name="chevron" size={13} />
			</label>
		{/if}
	</nav>
</div>

{#if data.repo.empty}
	<section class="empty">
		<h2>This repository is empty</h2>
		<p class="muted">Push an existing project to it:</p>
		<div class="proto" role="group" aria-label="Remote type">
			<button class:on={proto === 'ssh'} onclick={() => (proto = 'ssh')}>SSH</button>
			<button class:on={proto === 'https'} onclick={() => (proto = 'https')}>HTTPS</button>
		</div>
		<pre>git remote add origin {url}
git branch -M {data.repo.default_branch}
git push -u origin {data.repo.default_branch}</pre>
		<p class="muted">Or start from scratch:</p>
		<pre>git clone {url}</pre>
	</section>
{:else}
	{@render children()}
{/if}

<style>
	.head {
		margin-bottom: 1.5rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		font-size: 1.3rem;
		font-weight: 400;
		margin: 0;
	}
	h1 a {
		color: var(--fg);
	}
	h1 a:hover {
		color: var(--accent);
	}
	.owner {
		color: var(--muted) !important;
	}
	.owner:hover {
		color: var(--accent) !important;
	}
	.sep {
		margin: 0 0.3rem;
		color: var(--muted);
	}
	.name {
		font-weight: 650;
	}
	.private {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: 0.6rem;
		padding: 0.05rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.pin {
		margin-left: 0.6rem;
	}
	.pin button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.55rem;
		border-color: transparent;
		background: none;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.pin button:hover {
		border-color: var(--border) !important;
		color: var(--fg);
	}
	.pin button.on {
		color: var(--accent);
	}
	.proto button {
		font-size: 0.8rem;
		padding: 0.1rem 0.6rem;
		color: var(--muted);
	}
	.proto button.on {
		color: var(--accent);
		border-color: var(--accent);
	}
	.empty {
		padding: 1.5rem;
		border: 1px dashed var(--border);
		border-radius: 8px;
	}
	.empty h2 {
		margin: 0 0 0.3rem;
		font-size: 1.1rem;
	}
	.proto {
		display: flex;
		gap: 0.4rem;
	}
	pre {
		margin: 0.6rem 0 1rem;
		padding: 0.7rem 0.9rem;
		border-radius: 6px;
		background: var(--surface);
		font-family: var(--mono);
		font-size: 0.85rem;
		overflow-x: auto;
	}
	.head p {
		color: var(--muted);
		margin: 0.4rem 0 0;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 1.2rem;
		margin-top: 1rem;
		border-bottom: 1px solid var(--border);
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		padding: 0.5rem 0.1rem;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	nav a:hover {
		color: var(--fg);
	}
	nav a.active {
		color: var(--fg);
		border-color: var(--accent);
	}
	nav a.active :global(svg) {
		color: var(--accent);
	}
	.count {
		font-size: 0.75rem;
		background: var(--surface);
		border-radius: 999px;
		padding: 0 0.45rem;
	}
	.branch {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0 0 0.35rem auto;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--muted);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.branch:hover {
		border-color: color-mix(in srgb, var(--fg) 30%, var(--border));
	}
	.cur {
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--mono);
		color: var(--fg);
	}
	select {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	select:focus {
		outline: none;
	}
	.branch:has(select:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
