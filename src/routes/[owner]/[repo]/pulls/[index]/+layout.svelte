<script lang="ts">
	import Byline from '#lib/components/Byline.svelte';
	import EditTitle from '#lib/components/EditTitle.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import { page } from '$app/state';
	import { ago } from '#lib/time.js';
	import Icon from '#lib/components/Icon.svelte';
	import PrState from '#lib/components/PrState.svelte';

	let { data, children } = $props();
	const p = $derived(data.pull);
	const base = $derived(`/${data.repo.full_name}/pulls/${p.number}`);
	const tab = $derived(page.route.id?.split('/').pop());
</script>

<svelte:head><title>{p.title} · #{p.number} · {data.repo.full_name}</title></svelte:head>

<div class="head">
	<EditTitle title={p.title} number={p.number} can={data.repo.permissions.push || p.user.id === data.user?.id} action="{base}?/edit" />
	<div class="meta">
		<PrState pull={p} />
		<span><Byline login={p.user.login} agent={data.agent} href={data.agentHref} /> wants to merge <code>{p.head.label}</code> into <code>{p.base.ref}</code> · opened {ago(p.created_at)}</span>
		<!-- The conversation tab has a Labels sidebar, so only the other tabs show them here. -->
		{#if tab !== '[index]'}{#each p.labels as l (l.id)}<LabelChip label={l} />{/each}{/if}
	</div>
	<nav>
		<a href={base} class:on={tab === '[index]'}><Icon name="message" size={15} />Conversation</a>
		<a href="{base}/commits" class:on={tab === 'commits'}><Icon name="commit" size={15} />Commits</a>
		<a href="{base}/files" class:on={tab === 'files'}>
			<Icon name="diff" size={15} />Files{#if p.changed_files != null}<span class="count">{p.changed_files}</span>{/if}
		</a>
	</nav>
</div>

{@render children()}

<style>
	.head {
		margin-bottom: 1.25rem;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
		background: var(--surface);
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
	}
	nav {
		display: flex;
		gap: 1.2rem;
		margin-top: 1rem;
		border-bottom: 1px solid var(--border);
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		padding: 0.45rem 0.1rem;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	nav a:hover {
		color: var(--fg);
	}
	nav a.on {
		color: var(--fg);
		border-color: var(--accent);
	}
	nav a.on :global(svg) {
		color: var(--accent);
	}
	.count {
		font-size: 0.75rem;
		background: var(--surface);
		border-radius: 999px;
		padding: 0 0.45rem;
	}
</style>
