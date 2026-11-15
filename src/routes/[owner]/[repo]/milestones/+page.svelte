<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const can = $derived(!!data.repo.permissions.push);
	const full = $derived(data.repo.full_name);
	let adding = $state(false);
	let editing = $state<number | null>(null);
	const errorFor = (id: number) => (form?.action === 'save' && form.id === id ? form.error : undefined);
	const done = (after: () => void) => () => async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		if (result.type === 'success') after();
	};
	const date = (s: string) => new Date(s).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
	const issues = (title: string, state: string) => `/${full}/issues?milestone=${encodeURIComponent(title)}&state=${state}`;
</script>

<svelte:head><title>Milestones · {full}</title></svelte:head>

<div class="top">
	<div class="tabs">
		<a href="/{full}/labels"><Icon name="tag" size={14} />Labels</a>
		<a class="on" href="/{full}/milestones"><Icon name="milestone" size={14} />Milestones</a>
	</div>
	{#if can && !adding}<button class="primary" onclick={() => (adding = true)}><Icon name="plus" size={14} />New milestone</button>{/if}
</div>

{#snippet editor(m: { id: number; title: string; description: string; due_on: string | null } | null, close: () => void)}
	<form class="editor" method="POST" action="?/save" use:enhance={done(close)}>
		<input type="hidden" name="id" value={m?.id ?? ''} />
		<div class="row">
			<label class="field title">Title <input name="title" required value={m?.title ?? ''} autocomplete="off" /></label>
			<label class="field">Due <input type="date" name="due" value={m?.due_on?.slice(0, 10) ?? ''} /></label>
		</div>
		<label class="field">Description <textarea name="description" rows="3">{m?.description ?? ''}</textarea></label>
		<div class="buttons">
			<button class="primary">{m ? 'Save' : 'Create milestone'}</button>
			<button type="button" onclick={close}>Cancel</button>
			{#if errorFor(m?.id ?? 0)}<p class="error" role="alert">{errorFor(m?.id ?? 0)}</p>{/if}
		</div>
	</form>
{/snippet}

{#if adding}
	<div class="card">{@render editor(null, () => (adding = false))}</div>
{/if}

<div class="switch">
	<a href="?state=open" class:on={data.state === 'open'}><Icon name="milestone" size={14} />{data.counts.open} open</a>
	<a href="?state=closed" class:on={data.state === 'closed'}><Icon name="check" size={14} />{data.counts.closed} closed</a>
</div>

<ul class="list">
	{#each data.milestones as m (m.id)}
		{@const total = m.open_issues + m.closed_issues}
		{@const pct = total ? Math.round((m.closed_issues / total) * 100) : 0}
		{@const late = m.state === 'open' && m.due_on && Date.parse(m.due_on) < Date.now()}
		<li>
			{#if editing === m.id}
				{@render editor(m, () => (editing = null))}
			{:else}
				<div class="main">
					<a class="name" href={issues(m.title, 'open')}>{m.title}</a>
					<div class="meta">
						{#if m.state === 'closed' && m.closed_at}Closed {ago(m.closed_at)}{:else if m.due_on}<span class:late><Icon name="calendar" size={13} />{late ? 'Overdue since' : 'Due'} {date(m.due_on)}</span>{:else}No due date{/if}
					</div>
					{#if m.description}<p class="description">{m.description}</p>{/if}
				</div>
				<div class="progress">
					<div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="{pct}% complete"><span style="width: {pct}%"></span></div>
					<div class="counts">
						<span>{pct}% done</span>
						<a href={issues(m.title, 'open')}>{m.open_issues} open</a>
						<a href={issues(m.title, 'closed')}>{m.closed_issues} closed</a>
					</div>
					{#if can}
						<div class="row-actions">
							<button onclick={() => (editing = m.id)}>Edit</button>
							<form method="POST" action="?/state" use:enhance>
								<input type="hidden" name="id" value={m.id} />
								<input type="hidden" name="state" value={m.state === 'open' ? 'closed' : 'open'} />
								<button>{m.state === 'open' ? 'Close' : 'Reopen'}</button>
							</form>
							<form method="POST" action="?/delete" use:enhance={({ cancel }) => (confirm(`Delete ${m.title}? Its issues stay, without a milestone.`) ? undefined : cancel())}>
								<input type="hidden" name="id" value={m.id} />
								<button class="danger">Delete</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}
		</li>
	{:else}
		<li class="empty">
			<Icon name="milestone" size={28} />
			<strong>No {data.state} milestones</strong>
			<span class="muted">{data.state === 'open' ? 'Group issues into a milestone to track a release or a goal.' : 'Closed milestones show up here.'}</span>
		</li>
	{/each}
</ul>
{#if form && 'error' in form && form.error && form.action !== 'save'}<p class="error" role="alert">{form.error}</p>{/if}

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.tabs,
	.switch {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}
	.switch {
		margin-bottom: 0.75rem;
	}
	.tabs a,
	.switch a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.75rem;
		color: var(--muted);
	}
	.tabs a + a,
	.switch a + a {
		border-left: 1px solid var(--border);
	}
	.tabs a.on,
	.switch a.on {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
		color: var(--fg);
		font-weight: 500;
	}
	.top button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.card {
		padding: 1rem;
		margin-bottom: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.editor {
		display: grid;
		gap: 0.6rem;
		width: 100%;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.title {
		flex: 1 1 14rem;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.field {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	input,
	textarea {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	textarea {
		resize: vertical;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem);
		gap: 0.75rem 2rem;
		padding: 1rem;
	}
	.list li:has(.editor) {
		display: block;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li.empty {
		display: grid;
		grid-template-columns: 1fr;
		justify-items: center;
		gap: 0.4rem;
		padding: 2rem 1rem;
		color: var(--muted);
	}
	.empty strong {
		color: var(--fg);
	}
	.name {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--fg);
	}
	.name:hover {
		color: var(--accent);
	}
	.meta {
		margin-top: 0.2rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.meta span {
		display: inline-flex;
		gap: 0.3rem;
		align-items: center;
	}
	.late {
		color: var(--del-fg);
	}
	.description {
		margin: 0.5rem 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.progress {
		display: grid;
		gap: 0.4rem;
		align-content: start;
	}
	.bar {
		height: 0.5rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.counts {
		display: flex;
		gap: 0.75rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.counts a {
		color: var(--muted);
	}
	.counts a:hover {
		color: var(--accent);
	}
	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.25rem;
	}
	.danger {
		color: var(--del-fg);
	}
	.error {
		margin: 0;
		color: var(--del-fg);
	}
	@media (max-width: 700px) {
		.list li {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
