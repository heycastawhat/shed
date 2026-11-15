<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';

	let { data, form } = $props();
	const repo = $derived(`/${data.repo.full_name}`);
	const canEdit = $derived(data.repo.permissions.push);
	let dragging = $state<number | null>(null);
	let over = $state<{ column: number; before?: number } | null>(null);
	let editing = $state(false);

	// Drag and drop posts the same `move` action the keyboard-free fallback would.
	async function drop(column: number, before?: number) {
		const card = dragging;
		dragging = over = null;
		if (!card || card === before) return;
		const body = new FormData();
		body.set('card', String(card));
		body.set('column', String(column));
		if (before) body.set('before', String(before));
		const res = deserialize(await (await fetch('?/move', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } })).text());
		if (res.type === 'failure') alert(String((res.data as { error?: string })?.error ?? 'Could not move the card'));
		await invalidateAll();
	}
</script>

<svelte:head><title>{data.project.title} · Projects · {data.repo.full_name}</title></svelte:head>

<header>
	<p class="crumbs"><a href="{repo}/projects">Projects</a> /</p>
	{#if editing}
		<form method="POST" action="?/edit" class="edit" use:enhance={() => async ({ update }) => { await update(); editing = false; }}>
			<input name="title" value={data.project.title} required />
			<input name="description" value={data.project.description} placeholder="Description" />
			<select name="state" value={data.project.state}><option value="open">Open</option><option value="closed">Closed</option></select>
			<button class="primary">Save</button>
			<button type="button" onclick={() => (editing = false)}>Cancel</button>
		</form>
	{:else}
		<h2>{data.project.title}{#if data.project.state === 'closed'} <span class="tag">closed</span>{/if}</h2>
		{#if data.project.description}<p class="muted">{data.project.description}</p>{/if}
		{#if canEdit}
			<div class="tools">
				<button onclick={() => (editing = true)}><Icon name="pencil" size={13} />Edit</button>
				<form method="POST" action="?/delete" onsubmit={(e) => confirm(`Delete “${data.project.title}”? Its issues stay.`) || e.preventDefault()}><button>Delete</button></form>
			</div>
		{/if}
	{/if}
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
</header>

<div class="board">
	{#each data.columns as col (col.id)}
		<section
			class="column"
			class:over={over?.column === col.id && !over.before}
			role="list"
			ondragover={(e) => {
				if (dragging) e.preventDefault(), (over = { column: col.id });
			}}
			ondrop={(e) => (e.preventDefault(), drop(col.id))}
		>
			<div class="head">
				{#if canEdit}
					<form method="POST" action="?/renameColumn" use:enhance class="rename">
						<input type="hidden" name="column" value={col.id} />
						<input name="title" value={col.title} aria-label="Column name" onchange={(e) => e.currentTarget.form?.requestSubmit()} />
					</form>
				{:else}
					<strong>{col.title}</strong>
				{/if}
				<span class="count">{col.cards.length}</span>
				{#if canEdit}
					<form method="POST" action="?/deleteColumn" use:enhance onsubmit={(e) => confirm(`Delete the ${col.title} column and its cards?`) || e.preventDefault()}>
						<input type="hidden" name="column" value={col.id} />
						<button class="icon" title="Delete column"><Icon name="trash" size={13} /></button>
					</form>
				{/if}
			</div>
			{#each col.cards as card (card.id)}
				<article
					class="card"
					class:dragging={dragging === card.id}
					class:before={over?.column === col.id && over.before === card.id}
					draggable={canEdit}
					role="listitem"
					ondragstart={(e) => ((dragging = card.id), e.dataTransfer?.setData('text/plain', String(card.id)))}
					ondragend={() => (dragging = over = null)}
					ondragover={(e) => {
						if (dragging) e.preventDefault(), e.stopPropagation(), (over = { column: col.id, before: card.id });
					}}
					ondrop={(e) => (e.preventDefault(), e.stopPropagation(), drop(col.id, card.id))}
				>
					{#if card.issue_id}
						<span class="state" class:closed={card.state === 'closed'} class:merged={!!card.merged}><Icon name={card.is_pull ? 'changes' : 'issue'} size={14} /></span>
						<a href="{repo}/{card.is_pull ? 'pulls' : 'issues'}/{card.number}">{card.title}</a>
						<span class="muted small">#{card.number}</span>
					{:else}
						<p class="note">{card.note}</p>
					{/if}
					{#if canEdit}
						<form method="POST" action="?/deleteCard" use:enhance class="remove">
							<input type="hidden" name="card" value={card.id} />
							<button class="icon" title="Remove card"><Icon name="x" size={12} /></button>
						</form>
					{/if}
				</article>
			{/each}
			{#if canEdit}
				<form method="POST" action="?/addCard" use:enhance={() => async ({ update }) => update({ reset: true })} class="add">
					<input type="hidden" name="column" value={col.id} />
					<input name="text" placeholder="#12 or a note" aria-label="Add a card" />
				</form>
			{/if}
		</section>
	{/each}
	{#if canEdit}
		<form method="POST" action="?/addColumn" use:enhance={() => async ({ update }) => update({ reset: true })} class="column newcol">
			<input name="title" placeholder="+ Add a column" aria-label="New column" />
		</form>
	{/if}
</div>

<style>
	header {
		margin-bottom: 1rem;
	}
	.crumbs {
		margin: 0;
	}
	h2 {
		margin: 0.2rem 0;
	}
	.tools,
	.edit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.tools button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	input,
	select {
		font: inherit;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	.board {
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
		overflow-x: auto;
		padding-bottom: 1rem;
	}
	.column {
		flex: 0 0 17rem;
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
	.column.over {
		outline: 2px dashed var(--accent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.rename {
		flex: 1;
		min-width: 0;
	}
	.rename input {
		width: 100%;
		border-color: transparent;
		background: transparent;
		font-weight: 600;
		padding: 0.15rem 0.3rem;
	}
	.rename input:hover,
	.rename input:focus {
		border-color: var(--border);
		background: var(--bg);
	}
	.count {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.card {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: 0.15rem 0.4rem;
		padding: 0.55rem 1.6rem 0.55rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		cursor: grab;
	}
	.card.dragging {
		opacity: 0.4;
	}
	.card.before {
		box-shadow: 0 -3px 0 var(--accent);
	}
	.card a {
		color: var(--fg);
	}
	.card .small {
		grid-column: 2;
	}
	.note {
		grid-column: 1 / -1;
		margin: 0;
		white-space: pre-wrap;
	}
	.state {
		color: var(--accent);
		padding-top: 0.15rem;
	}
	.state.closed {
		color: var(--del-fg);
	}
	.state.merged {
		color: var(--accent);
	}
	.remove {
		position: absolute;
		top: 0.3rem;
		right: 0.3rem;
	}
	.icon {
		background: none;
		border: 0;
		padding: 0.15rem;
		color: var(--muted);
		cursor: pointer;
	}
	.add input,
	.newcol input {
		width: 100%;
		box-sizing: border-box;
	}
	.newcol {
		background: transparent;
		border-style: dashed;
	}
	.tag {
		font-size: 0.75rem;
		font-weight: 400;
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--muted);
	}
	.small {
		font-size: 0.82rem;
	}
	.error {
		color: var(--del-fg);
	}
</style>
