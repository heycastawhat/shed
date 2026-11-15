<script lang="ts">
	import Byline from '#lib/components/Byline.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import IssueState from '#lib/components/IssueState.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import ListFilters from '#lib/components/ListFilters.svelte';
	import Assignees from '#lib/components/Assignees.svelte';
	import Pager from '#lib/components/Pager.svelte';
	import { page } from '$app/state';
	import { listQuery } from '#lib/list-query.js';
	import { bodyAgent } from '#lib/sign.js';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const q = (set: Record<string, string | null>) => listQuery(page.url, set);
	const filtered = $derived(!!(data.label || data.milestone || data.assignee));
</script>

<div class="top">
	<div class="left">
		<div class="filters">
			<a href={q({ state: 'open' })} class:on={data.state === 'open'}><Icon name="issue" size={14} />Open</a>
			<a href={q({ state: 'closed' })} class:on={data.state === 'closed'}><Icon name="check" size={14} />Closed</a>
		</div>
		<ListFilters labels={data.labels} milestones={data.milestones} label={data.label} milestone={data.milestone} assignee={data.assignee} me={data.user?.login} />
	</div>
	<div class="right">
		<a class="button" href="/{data.repo.full_name}/labels"><Icon name="tag" size={14} />Labels</a>
		<a class="button" href="/{data.repo.full_name}/milestones"><Icon name="milestone" size={14} />Milestones</a>
		<a class="button primary" href="/{data.repo.full_name}/issues/new"><Icon name="plus" size={14} />New issue</a>
	</div>
</div>

<ul class="issues">
	{#each data.issues as i (i.number)}
		<li>
			<IssueState state={i.state} />
			<div>
				<a href="/{data.repo.full_name}/issues/{i.number}"><strong>{i.title}</strong></a>
				{#each i.labels as l (l.id)}<a class="chip" href={q({ labels: l.name })} title="Show only {l.name}"><LabelChip label={l} /></a>{/each}
				<div class="meta">
					#{i.number} by <Byline login={i.user.login} agent={bodyAgent(i.body)} /> · {ago(i.created_at)}
					{#if i.milestone}· <a class="ms" href={q({ milestone: i.milestone.title })} title="Show only {i.milestone.title}"><Icon name="milestone" size={13} />{i.milestone.title}</a>{/if}
					{#if i.comments}· <span class="comments"><Icon name="message" size={13} />{i.comments}</span>{/if}
				</div>
			</div>
			<Assignees users={i.assignees} />
		</li>
	{:else}
		<li class="empty">
			<Icon name="issue" size={28} />
			<strong>No {data.state} issues{filtered ? ' match these filters' : ''}</strong>
			<span class="muted">
				{#if filtered}<a href={q({ labels: null, milestone: null, assignee: null })}>Clear the filters</a>{:else}{data.state === 'open' ? 'Nothing to do. Open one to track a bug or an idea.' : 'Closed issues show up here.'}{/if}
			</span>
		</li>
	{/each}
</ul>

<Pager page={data.page} total={data.total} size={data.size} />

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.right {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.right .button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--fg);
	}
	.left {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.button.primary {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		font-weight: 600;
	}
	.button.primary:hover {
		filter: brightness(1.1);
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
	.issues {
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
	.comments {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		vertical-align: bottom;
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
</style>
