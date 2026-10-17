<script lang="ts">
	import { ago } from '#lib/time.js';
	import Icon from '#lib/components/Icon.svelte';
	import PrState from '#lib/components/PrState.svelte';

	let { data } = $props();
</script>

<div class="filters">
	<a href="?state=open" class:on={data.state === 'open'}><Icon name="changes" size={14} />Open</a>
	<a href="?state=closed" class:on={data.state === 'closed'}><Icon name="check" size={14} />Closed</a>
</div>

<ul class="pulls">
	{#each data.pulls as p (p.number)}
		<li>
			<PrState pull={p} />
			<div>
				<a href="/{data.repo.full_name}/pulls/{p.number}"><strong>{p.title}</strong></a>
				<div class="meta">
					#{p.number} by {p.user.login} · {ago(p.created_at)} · <code>{p.head.label}</code> → <code>{p.base.ref}</code>
					{#if p.comments}· {p.comments} comment{p.comments === 1 ? '' : 's'}{/if}
				</div>
			</div>
		</li>
	{:else}
		<li class="empty">
			<Icon name="changes" size={28} />
			<strong>No {data.state} pull requests</strong>
			<span class="muted">{data.state === 'open' ? 'Push a branch and open one, or let an agent do it.' : 'Merged and closed pull requests show up here.'}</span>
		</li>
	{/each}
</ul>

<style>
	.filters {
		display: inline-flex;
		gap: 0.2rem;
		margin-bottom: 0.75rem;
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
	.filters a:hover {
		color: var(--fg);
	}
	.filters a.on {
		background: var(--bg);
		color: var(--fg);
		font-weight: 500;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
	}
	.empty {
		flex-direction: column;
		align-items: center !important;
		gap: 0.35rem !important;
		padding: 2.5rem 1rem !important;
		text-align: center;
		color: var(--muted);
	}
	.empty strong {
		color: var(--fg);
	}
	li:not(.empty):hover {
		background: var(--surface);
	}
	.pulls {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	li {
		display: flex;
		gap: 0.8rem;
		align-items: baseline;
		padding: 0.8rem 1rem;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li a {
		color: var(--fg);
	}
	strong {
		font-weight: 500;
	}
	.meta {
		font-size: 0.85rem;
		color: var(--muted);
		margin-top: 0.25rem;
	}
	code {
		font-family: var(--mono);
		font-size: 0.8rem;
	}
</style>
