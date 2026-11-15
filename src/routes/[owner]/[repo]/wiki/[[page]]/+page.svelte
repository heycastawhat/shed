<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const base = $derived(`/${data.repo.full_name}/wiki`);
	const canEdit = $derived(data.repo.permissions.push);
</script>

<svelte:head><title>{data.page?.title ?? 'Wiki'} · {data.repo.full_name}</title></svelte:head>

{#snippet editor(title: string, text: string, from: string)}
	<form class="editor" method="POST" action="?/save" use:enhance>
		<input type="hidden" name="from" value={from} />
		<input name="title" value={title} placeholder="Page title" required aria-label="Title" />
		<textarea name="text" rows="20" placeholder="Write in markdown. [[Other page]] links to another page.">{text}</textarea>
		<input name="message" placeholder="What changed? (optional)" aria-label="Edit message" />
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<div class="row">
			<button class="primary">Save page</button>
			<a class="btn" href={from ? `${base}/${from}` : base}>Cancel</a>
		</div>
	</form>
{/snippet}

{#if canEdit && (data.creating || (!data.pages.length && data.editing))}
	{@render editor(data.creating ? '' : data.name.replaceAll('-', ' '), '', '')}
{:else if canEdit && data.editing && data.page}
	{@render editor(data.page.title, data.page.markdown, data.page.name)}
{:else if canEdit && data.editing && !data.page}
	{@render editor(data.name.replaceAll('-', ' '), '', '')}
{:else if !data.pages.length}
	<section class="empty">
		<Icon name="wiki" size={28} />
		<strong>This wiki has no pages yet</strong>
		{#if canEdit}<a class="btn" href="{base}/Home?edit">Create the first page</a>{/if}
	</section>
{:else}
	<div class="wiki">
		<article>
			{#if data.page}
				<header>
					<h2>{data.page.title}</h2>
					{#if data.page.updated}<span class="muted">Edited by {data.page.updated.by} {ago(data.page.updated.at)}</span>{/if}
					{#if canEdit}
						<a class="edit" href="{base}/{data.page.name}?edit"><Icon name="pencil" size={13} />Edit</a>
						<form method="POST" action="?/delete" onsubmit={(e) => confirm(`Delete “${data.page?.title}”?`) || e.preventDefault()}><button class="link">Delete</button></form>
					{/if}
				</header>
				<div class="markdown">{@html data.page.html}</div>
			{:else}
				<p class="muted">There's no page called “{data.name}”.{#if canEdit} <a href="{base}/{data.name}?edit">Create it</a>.{/if}</p>
			{/if}
		</article>
		<nav aria-label="Wiki pages">
			<h3>Pages</h3>
			{#each data.pages as p (p.sub_url)}
				<a href="{base}/{p.sub_url}" class:on={p.sub_url === data.page?.name}>{p.title}</a>
			{/each}
			{#if canEdit}<a class="muted" href="{base}?new"><Icon name="plus" size={13} />New page</a>{/if}
		</nav>
	</div>
{/if}

<style>
	.editor {
		display: grid;
		gap: 0.75rem;
	}
	.editor input,
	.editor textarea {
		font: inherit;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	.editor textarea {
		font-family: var(--mono, ui-monospace, monospace);
		font-size: 0.9rem;
		resize: vertical;
	}
	.editor .row {
		display: flex;
		gap: 0.5rem;
	}
	.error {
		color: var(--del-fg);
	}
	button.link {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: var(--muted);
		cursor: pointer;
	}
	header form {
		display: inline;
	}
	.wiki {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 200px;
		gap: 1.5rem;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
		padding-bottom: 0.6rem;
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
	}
	header .muted {
		font-size: 0.85rem;
	}
	.edit {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		font-size: 0.9rem;
	}
	nav h3 {
		margin: 0 0 0.4rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.5rem;
		border-radius: 6px;
		color: var(--fg);
	}
	nav a:hover,
	nav a.on {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	nav a.muted {
		color: var(--muted);
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2.5rem 1rem;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.empty strong {
		color: var(--fg);
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	@media (max-width: 700px) {
		.wiki {
			grid-template-columns: 1fr;
		}
		nav {
			order: -1;
			flex-direction: row;
			flex-wrap: wrap;
		}
		nav h3 {
			display: none;
		}
	}
</style>
