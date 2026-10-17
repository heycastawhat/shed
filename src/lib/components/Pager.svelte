<script lang="ts">
	import { page as app } from '$app/state';
	import { listQuery } from '#lib/list-query.js';
	import Icon from './Icon.svelte';

	let { page, total, size }: { page: number; total: number; size: number } = $props();
	const last = $derived(Math.ceil(total / size));
	const shown = $derived(Array.from({ length: last }, (_, i) => i + 1).filter((n) => n === 1 || n === last || Math.abs(n - page) <= 2));
	const href = (n: number) => listQuery(app.url, { page: n > 1 ? n : null });
</script>

{#if last > 1}
	<nav class="pager" aria-label="Pages">
		{#if page > 1}<a href={href(page - 1)}><Icon name="left" size={14} />Previous</a>{:else}<span class="off"><Icon name="left" size={14} />Previous</span>{/if}
		{#each shown as n, i (n)}
			{#if i && n - shown[i - 1] > 1}<span class="gap">…</span>{/if}
			<a href={href(n)} class="num" class:on={n === page} aria-current={n === page ? 'page' : undefined}>{n}</a>
		{/each}
		{#if page < last}<a href={href(page + 1)}>Next<Icon name="right" size={14} /></a>{:else}<span class="off">Next<Icon name="right" size={14} /></span>{/if}
	</nav>
{/if}

<style>
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.25rem;
		margin-top: 1rem;
		font-size: 0.9rem;
	}
	a,
	span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
		color: var(--muted);
	}
	a:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.num {
		justify-content: center;
		min-width: 1.1rem;
	}
	.on {
		background: var(--accent);
		color: var(--bg);
		font-weight: 600;
	}
	.on:hover {
		background: var(--accent);
		color: var(--bg);
	}
	.off {
		opacity: 0.5;
	}
</style>
