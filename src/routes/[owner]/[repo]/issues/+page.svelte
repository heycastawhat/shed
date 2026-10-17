<script lang="ts">
	import Byline from '#lib/components/Byline.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import IssueState from '#lib/components/IssueState.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import LabelFilter, { listQuery } from '#lib/components/LabelFilter.svelte';
	import { bodyAgent } from '#lib/sign.js';
	import { ago } from '#lib/time.js';

	let { data } = $props();
</script>

<div class="top">
	<div class="left">
		<div class="filters">
			<a href={listQuery('open', data.label)} class:on={data.state === 'open'}><Icon name="issue" size={14} />Open</a>
			<a href={listQuery('closed', data.label)} class:on={data.state === 'closed'}><Icon name="check" size={14} />Closed</a>
		</div>
		<LabelFilter labels={data.labels} active={data.label} state={data.state} />
	</div>
	<a class="button primary" href="/{data.repo.full_name}/issues/new"><Icon name="plus" size={14} />New issue</a>
</div>

<ul class="issues">
	{#each data.issues as i (i.number)}
		<li>
			<IssueState state={i.state} />
			<div>
				<a href="/{data.repo.full_name}/issues/{i.number}"><strong>{i.title}</strong></a>
				{#each i.labels as l (l.id)}<a class="chip" href={listQuery(data.state, l.name)} title="Show only {l.name}"><LabelChip label={l} /></a>{/each}
				<div class="meta">
					#{i.number} by <Byline login={i.user.login} agent={bodyAgent(i.body)} /> · {ago(i.created_at)}
					{#if i.comments}· <span class="comments"><Icon name="message" size={13} />{i.comments}</span>{/if}
				</div>
			</div>
		</li>
	{:else}
		<li class="empty">
			<Icon name="issue" size={28} />
			<strong>No {data.state} issues{data.label ? ` labelled ${data.label}` : ''}</strong>
			<span class="muted">
				{#if data.label}<a href={listQuery(data.state)}>Clear the filter</a>{:else}{data.state === 'open' ? 'Nothing to do. Open one to track a bug or an idea.' : 'Closed issues show up here.'}{/if}
			</span>
		</li>
	{/each}
</ul>

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.left {
		display: flex;
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
	.meta {
		font-size: 0.85rem;
		color: var(--muted);
		margin-top: 0.25rem;
	}
</style>
