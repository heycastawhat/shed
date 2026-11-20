<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FileFinder from '#lib/components/FileFinder.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';
	import RepoActions from '#lib/components/RepoActions.svelte';
	import { refPath } from '#lib/repo.js';

	let { data, children } = $props();
	const base = $derived(`/${data.repo.full_name}`);
	const pinned = $derived(data.pins.includes(data.repo.full_name));
	const listing = $derived(page.route.id?.match(/\/(branches|releases)(?:\/|$)/)?.[1]);
	// svelte-ignore state_referenced_locally
	let proto = $state<'ssh' | 'https'>(data.repo.ssh_url ? 'ssh' : 'https');
	const url = $derived(proto === 'ssh' ? data.repo.ssh_url : data.repo.clone_url);
	const section = $derived(
		page.route.id?.match(/^\/\[owner\]\/\[repo\]\/(pulls|issues|agents|actions|wiki|activity|projects|settings)/)?.[1] ??
			(/^\/\[owner\]\/\[repo\]\/(labels|milestones)/.test(page.route.id ?? '') ? 'issues' : null) ??
			(/^\/\[owner\]\/\[repo\]\/compare/.test(page.route.id ?? '') ? 'pulls' : null) ??
			(/\/commits?\//.test(page.route.id ?? '') ? 'commits' : 'code')
	);

	// On a narrow screen the tab row scrolls; bring the current section's tab into view rather than leaving it off to the right.
	function showActive(tabs: HTMLElement) {
		$effect(() => {
			void section;
			const a = tabs.querySelector<HTMLElement>('a.active');
			if (a && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = a.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - a.offsetWidth) / 2;
		});
	}

	function switchRef(ref: string) {
		const path = page.params.path ?? '';
		const route = page.route.id?.match(/\/(tree|blob|commits|blame|edit)\//)?.[1] ?? 'tree';
		const kind = route === 'edit' ? 'blob' : route;
		goto(`${base}/${kind}/${refPath(ref, path)}`);
	}
</script>

<div class="head">
	<h1>
		<a class="owner" href="/{data.repo.owner.login}">{data.repo.owner.login}</a><span class="sep">/</span><a class="name" href={base}>{data.repo.name}</a>
		{#if data.repo.private}<span class="private" title="Private"><Icon name="lock" size={12} /><span class="label">Private</span></span>{/if}
		<form class="pin" method="POST" action="/pin">
			<input type="hidden" name="repo" value={data.repo.full_name} />
			<input type="hidden" name="pin" value={pinned ? '0' : '1'} />
			<button class:on={pinned} title={pinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'}><Icon name="pin" size={13} /><span class="label">{pinned ? 'Pinned' : 'Pin'}</span></button>
		</form>
		<RepoActions repo={data.repo.full_name} social={data.social} signedIn={!!data.user} />
	</h1>
	{#if data.forkedFrom}<p class="forked"><Icon name="fork" size={13} />forked from <a href="/{data.forkedFrom.owner}/{data.forkedFrom.name}">{data.forkedFrom.owner}/{data.forkedFrom.name}</a></p>{/if}
	{#if data.mirror}
		<div class="forked">
			<Icon name="refresh" size={13} />mirror of <a href={data.mirror.url} rel="noreferrer">{data.mirror.url.replace(/^https?:\/\//, '')}</a>
			{#if data.mirror.error}· <span class="mirror-error" title={data.mirror.error}>last sync failed</span>{:else if data.mirror.updated_at}· synced {ago(data.mirror.updated_at)}{/if}
			{#if data.repo.permissions.push}<form method="POST" action="/{data.repo.full_name}/sync" class="sync"><button>Sync now</button></form>{/if}
		</div>
	{/if}
	{#if data.repo.description}<p>{data.repo.description}</p>{/if}
	<nav>
		<div class="tabs" {@attach showActive}>
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
			{#if data.repo.has_actions}<a href="{base}/actions" class:active={section === 'actions'}><Icon name="actions" size={15} />Actions</a>{/if}
			<a href="{base}/projects" class:active={section === 'projects'}><Icon name="board" size={15} />Projects</a>
			{#if data.repo.has_wiki}<a href="{base}/wiki" class:active={section === 'wiki'}><Icon name="wiki" size={15} />Wiki</a>{/if}
			<a href="{base}/activity" class:active={section === 'activity'}><Icon name="activity" size={15} />Activity</a>
			{#if data.agents}<a href="{base}/agents" class:active={section === 'agents'}><Icon name="agents" size={15} />Agents</a>{/if}
			{#if data.repo.permissions.admin}
				<a href="{base}/settings" class:active={section === 'settings'}><Icon name="sliders" size={15} />Settings</a>
			{/if}
		</div>
		<div class="refs">
			{#if section === 'code' && data.branches.length}
				<a class="count-link" class:active={listing === 'branches'} href="{base}/branches"><Icon name="branch" size={14} />{data.branches.length} branch{data.branches.length === 1 ? '' : 'es'}</a>
				<a class="count-link" class:active={listing === 'releases'} href="{base}/releases"><Icon name="tag" size={14} />{data.tags} tag{data.tags === 1 ? '' : 's'}</a>
			{/if}
			{#if data.branches.length && !listing && (section === 'code' || section === 'commits')}
				<label class="branch">
					<Icon name="branch" size={14} />
					<span class="cur">{data.ref}</span>
					<select value={data.ref} onchange={(e) => switchRef(e.currentTarget.value)} aria-label="Branch">
						{#each data.branches as b (b)}<option>{b}</option>{/each}
					</select>
					<Icon name="chevron" size={13} />
				</label>
			{/if}
		</div>
	</nav>
</div>

{#if data.repo.empty && page.route.id === '/[owner]/[repo]'}
	<section class="empty">
		<h2>This repository is empty</h2>
		<p class="muted">Push an existing project to it:</p>
		<div class="proto" role="group" aria-label="Remote type">
			{#if data.repo.ssh_url}<button class:on={proto === 'ssh'} onclick={() => (proto = 'ssh')}>SSH</button>{/if}
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
	{#if section === 'code' && !data.repo.empty}<FileFinder repo={data.repo.full_name} ref={data.ref} />{/if}
{/if}

<style>
	.mirror-error {
		color: var(--del-fg);
	}
	.sync {
		display: inline;
	}
	.sync button {
		font: inherit;
		font-size: 0.85em;
		padding: 0.05rem 0.4rem;
	}
	.head {
		margin-bottom: 1.5rem;
		container-type: inline-size;
	}
	h1 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		overflow-wrap: anywhere;
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
	@container (max-width: 560px) {
		.pin .label,
		.private .label {
			display: none;
		}
		.private {
			margin-left: 0.4rem;
			padding: 0.15rem 0.35rem;
		}
		.pin {
			margin-left: 0.3rem;
		}
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
		border-radius: var(--radius);
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
	.head .forked {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.2rem;
		font-size: 0.85rem;
	}
	/* Flex wraps by the tabs' full width, so when they and the ref controls don't fit on one line the controls drop below
	   instead of the last tabs scrolling out of sight. */
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.2rem;
		margin-top: 1rem;
	}
	.tabs {
		display: flex;
		flex: 1 1 auto;
		gap: 1.2rem;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		border-bottom: 1px solid var(--border);
	}
	@supports (animation-timeline: scroll()) {
		.tabs {
			animation: tabs-fade linear both;
			animation-timeline: scroll(self inline);
		}
	}
	/* Fade whichever ends have more tabs past them. */
	@keyframes tabs-fade {
		from {
			mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent);
		}
		2%,
		98% {
			mask-image: linear-gradient(to right, transparent, #000 2.5rem, #000 calc(100% - 2.5rem), transparent);
		}
		to {
			mask-image: linear-gradient(to right, transparent, #000 2.5rem);
		}
	}
	@container (max-width: 640px) {
		.tabs {
			flex-basis: 100%;
		}
		.refs {
			flex-wrap: wrap;
			margin: 0.1rem 0 0;
		}
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex: none;
		white-space: nowrap;
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
	.refs {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-left: auto;
	}
	.refs:not(:has(:global(*))) {
		display: none;
	}
	nav a.count-link {
		gap: 0.3rem;
		padding: 0.2rem 0;
		margin: 0;
		border: 0;
		font-size: 0.85rem;
	}
	nav a.count-link.active {
		color: var(--fg);
	}
	.branch {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.35rem;
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
