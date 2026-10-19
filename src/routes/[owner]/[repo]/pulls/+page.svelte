<script lang="ts">
	import Byline from '#lib/components/Byline.svelte';
	import { bodyAgent } from '#lib/sign.js';
	import { ago } from '#lib/time.js';
	import Icon from '#lib/components/Icon.svelte';
	import PrState from '#lib/components/PrState.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import ListFilters from '#lib/components/ListFilters.svelte';
	import Assignees from '#lib/components/Assignees.svelte';
	import Pager from '#lib/components/Pager.svelte';
	import { page } from '$app/state';
	import { listQuery } from '#lib/list-query.js';

	let { data } = $props();
	const q = (set: Record<string, string | null>) => listQuery(page.url, set);
	const filtered = $derived(!!(data.label || data.milestone || data.assignee));
</script>

<div class="top">
	<div class="filters">
		<a href={q({ state: 'open' })} class:on={data.state === 'open'}><Icon name="changes" size={14} />Open</a>
		<a href={q({ state: 'closed' })} class:on={data.state === 'closed'}><Icon name="check" size={14} />Closed</a>
	</div>
	<ListFilters labels={data.labels} milestones={data.milestones} label={data.label} milestone={data.milestone} assignee={data.assignee} me={data.user?.login} />
</div>

<ul class="pulls">
	{#each data.pulls as p (p.number)}
		<li>
			<PrState pull={p} />
			<div>
				<a href="/{data.repo.full_name}/pulls/{p.number}"><strong>{p.title}</strong></a>
				{#each p.labels as l (l.id)}<a class="chip" href={q({ labels: l.name })} title="Show only {l.name}"><LabelChip label={l} /></a>{/each}
				<div class="meta">
					#{p.number} by <Byline login={p.user.login} agent={bodyAgent(p.body)} /> · {ago(p.created_at)} · <code>{p.head.label}</code> → <code>{p.base.ref}</code>
					{#if p.milestone}· <a class="ms" href={q({ milestone: p.milestone.title })} title="Show only {p.milestone.title}"><Icon name="milestone" size={13} />{p.milestone.title}</a>{/if}
					{#if p.comments}· {p.comments} comment{p.comments === 1 ? '' : 's'}{/if}
				</div>
			</div>
			<Assignees users={p.assignees} />
		</li>
	{:else}
		<li class="empty">
			<Icon name="changes" size={28} />
			<strong>No {data.state} pull requests{filtered ? ' match these filters' : ''}</strong>
			<span class="muted">
				{#if filtered}<a href={q({ labels: null, milestone: null, assignee: null })}>Clear the filters</a>{:else}{data.state === 'open' ? 'Push a branch and open one, or let an agent do it.' : 'Merged and closed pull requests show up here.'}{/if}
			</span>
		</li>
	{/each}
</ul>

<Pager page={data.page} total={data.total} size={data.size} />

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.filters {
		display: inline-flex;
		gap: 0.2rem;
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
	.empty a {
		color: var(--accent);
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
	.chip {
		margin-left: 0.35rem;
	}
	strong {
		font-weight: 500;
	}
	.ms {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: var(--muted);
		vertical-align: bottom;
	}
	.ms:hover {
		color: var(--fg);
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
