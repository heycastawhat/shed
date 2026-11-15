<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';

	let { data, form } = $props();
	const can = $derived(!!data.repo.permissions.push);
	let adding = $state(false);
	let editing = $state<number | null>(null);
	let preview = $state({ name: '', color: '#6f42c1', description: '' });
	const errorFor = (id: number) => (form?.action === 'save' && form.id === id ? form.error : undefined);
	const done = (after: () => void) => () => async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		if (result.type === 'success') after();
	};
</script>

<svelte:head><title>Labels · {data.repo.full_name}</title></svelte:head>

<div class="top">
	<div class="tabs">
		<a class="on" href="/{data.repo.full_name}/labels"><Icon name="tag" size={14} />Labels</a>
		<a href="/{data.repo.full_name}/milestones"><Icon name="milestone" size={14} />Milestones</a>
	</div>
	{#if can && !adding}<button class="primary" onclick={() => (adding = true)}><Icon name="plus" size={14} />New label</button>{/if}
</div>

{#snippet editor(l: { id: number; name: string; color: string; description: string } | null, close: () => void)}
	<form class="editor" method="POST" action="?/save" use:enhance={done(close)}>
		<input type="hidden" name="id" value={l?.id ?? ''} />
		<label class="field name">Name <input name="name" required value={l?.name ?? ''} autocomplete="off" oninput={(e) => !l && (preview.name = e.currentTarget.value)} /></label>
		<label class="field desc">Description <input name="description" value={l?.description ?? ''} autocomplete="off" /></label>
		<label class="field colour">Colour <input type="color" name="color" value={l ? `#${l.color}` : preview.color} oninput={(e) => !l && (preview.color = e.currentTarget.value)} /></label>
		<div class="buttons">
			<button class="primary">{l ? 'Save' : 'Create label'}</button>
			<button type="button" onclick={close}>Cancel</button>
		</div>
		{#if errorFor(l?.id ?? 0)}<p class="error" role="alert">{errorFor(l?.id ?? 0)}</p>{/if}
	</form>
{/snippet}

{#if adding}
	<div class="card">
		<div class="preview"><LabelChip label={{ name: preview.name || 'Label preview', color: preview.color }} /></div>
		{@render editor(null, () => (adding = false))}
	</div>
{/if}

<ul class="list">
	{#each data.labels as l (l.id)}
		<li>
			{#if editing === l.id}
				{@render editor(l, () => (editing = null))}
			{:else}
				<a class="chip" href="/{data.repo.full_name}/issues?labels={encodeURIComponent(l.name)}"><LabelChip label={l} /></a>
				<span class="desc muted">{l.description}</span>
				<a class="count muted" href="/{data.repo.full_name}/issues?labels={encodeURIComponent(l.name)}">{l.open} open issue{l.open === 1 ? '' : 's'}</a>
				{#if can}
					<span class="row-actions">
						<button onclick={() => (editing = l.id)}>Edit</button>
						<form method="POST" action="?/delete" use:enhance={({ cancel }) => (confirm(`Delete the ${l.name} label? It comes off every issue and pull request.`) ? undefined : cancel())}>
							<input type="hidden" name="id" value={l.id} />
							<button class="danger">Delete</button>
						</form>
					</span>
				{/if}
			{/if}
		</li>
	{:else}
		<li class="empty">No labels yet.</li>
	{/each}
</ul>

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.tabs {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}
	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.75rem;
		color: var(--muted);
	}
	.tabs a + a {
		border-left: 1px solid var(--border);
	}
	.tabs a.on {
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
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		margin-bottom: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.editor {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
		gap: 0.6rem;
		align-items: end;
		width: 100%;
	}
	.buttons {
		grid-column: 1 / -1;
		display: flex;
		gap: 0.5rem;
	}
	.field {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	input:not([type='color']) {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	input[type='color'] {
		width: 3rem;
		height: 2.2rem;
		padding: 0.15rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
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
		grid-template-columns: minmax(8rem, 14rem) minmax(0, 1fr) auto auto;
		gap: 0.5rem 1rem;
		align-items: center;
		padding: 0.7rem 1rem;
	}
	.list li:has(.editor) {
		display: block;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li.empty {
		display: block;
		text-align: center;
		color: var(--muted);
	}
	.desc {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.count {
		white-space: nowrap;
		font-size: 0.85rem;
	}
	.count:hover {
		color: var(--accent);
	}
	.row-actions {
		display: flex;
		gap: 0.4rem;
	}
	.danger {
		color: var(--del-fg);
	}
	.error {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--del-fg);
	}
	@media (max-width: 700px) {
		.list li {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.desc {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.desc:empty {
			display: none;
		}
		.row-actions {
			grid-column: 1 / -1;
		}
		.editor {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.editor .desc {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
