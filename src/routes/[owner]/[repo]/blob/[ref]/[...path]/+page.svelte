<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import CodeLines from '#lib/components/CodeLines.svelte';
	import CommitBox from '#lib/components/CommitBox.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { refPath } from '#lib/repo.js';

	let { data, form } = $props();
	const path = $derived(page.params.path ?? '');
	const base = $derived(`/${data.repo.full_name}`);
	const raw = $derived(`${base}/raw/${refPath(data.ref, path)}`);
	const permalink = $derived(`${base}/blob/${refPath(data.commit, path)}`);
	const canEdit = $derived(data.repo.permissions.push && data.branches.includes(data.ref));
	const size = $derived(
		data.size < 1024 ? `${data.size} B` : data.size < 1048576 ? `${(data.size / 1024).toFixed(1)} KB` : `${(data.size / 1048576).toFixed(1)} MB`
	);
	let deleting = $state(false);
	let busy = $state(false);
	let copied = $state(false);

	async function copy() {
		const text = fetch(raw).then((r) => r.text()).then((t) => new Blob([t], { type: 'text/plain' }));
		await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })]);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<svelte:head><title>{path} · {data.repo.full_name}</title></svelte:head>

<Breadcrumbs repo={data.repo.full_name} ref={data.ref} {path} />

<div class="file">
	<div class="bar">
		<span class="meta">{'lines' in data ? `${data.lines} line${data.lines === 1 ? '' : 's'} · ` : ''}{size}</span>
		<span class="actions">
			{#if data.kind === 'markdown'}<a href="?plain">Source</a>{:else if page.url.searchParams.has('plain')}<a href="?">Preview</a>{/if}
			<a href={raw}>Raw</a>
			{#if 'lines' in data}<a href="{base}/blame/{refPath(data.ref, path)}">Blame</a>{/if}
			<a href="{base}/commits/{refPath(data.ref, path)}">History</a>
			<a href={permalink} title="This file at commit {data.commit.slice(0, 8)}">Permalink</a>
			<span class="icons">
				{#if 'lines' in data}
					<button class="icon" onclick={copy} title={copied ? 'Copied' : 'Copy file contents'} aria-label="Copy file contents"><Icon name={copied ? 'check' : 'copy'} size={15} /></button>
				{/if}
				{#if canEdit}
					{#if 'lines' in data}<a class="icon" href="{base}/edit/{refPath(data.ref, path)}" title="Edit this file" aria-label="Edit this file"><Icon name="pencil" size={15} /></a>{/if}
					<button class="icon danger" class:on={deleting} onclick={() => (deleting = !deleting)} title="Delete this file" aria-label="Delete this file"><Icon name="trash" size={15} /></button>
				{/if}
			</span>
		</span>
	</div>
	{#if deleting}
		<form
			class="delete"
			method="POST"
			action="?/delete"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<p>Delete <strong>{path}</strong> from <code>{data.ref}</code>?</p>
			<input type="hidden" name="sha" value={data.blob} />
			<CommitBox ref={data.ref} login={data.user?.login ?? 'patch'} error={form?.error} {busy} label="Delete file" cancel="{base}/blob/{refPath(data.ref, path)}" placeholder="Delete {path}" />
		</form>
	{/if}
	{#if data.kind === 'code'}
		<CodeLines html={data.html} />
	{:else if data.kind === 'markdown'}
		<article class="markdown">{@html data.html}</article>
	{:else if data.kind === 'image'}
		<div class="center"><img src={raw} alt={data.name} /></div>
	{:else}
		<div class="center muted">{data.kind === 'binary' ? 'Binary file' : 'File too large to display'} · <a href={raw}>Download</a></div>
	{/if}
</div>

<style>
	.file {
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem 1rem;
		padding: 0.4rem 0.6rem 0.4rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 1rem;
	}
	.icons {
		display: flex;
		gap: 0.15rem;
	}
	.icon {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
		color: var(--muted);
	}
	.icon:hover {
		color: var(--fg);
		border-color: var(--border) !important;
	}
	.danger:hover,
	.danger.on {
		color: var(--del-fg);
	}
	.delete {
		padding: 1rem;
		border-bottom: 1px solid var(--border);
	}
	.delete p {
		margin: 0 0 0.8rem;
	}
	.delete code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.markdown {
		padding: 1.5rem 2rem;
	}
	.center {
		padding: 2rem;
		text-align: center;
	}
	.center img {
		max-width: 100%;
	}
	@media (max-width: 700px) {
		.markdown {
			padding: 1rem;
		}
	}
</style>
