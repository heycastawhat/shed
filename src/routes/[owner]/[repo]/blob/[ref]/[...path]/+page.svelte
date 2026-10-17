<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import { refPath } from '#lib/repo.js';

	let { data } = $props();
	const raw = $derived(`/${data.repo.full_name}/raw/${refPath(data.ref, page.params.path)}`);
	const size = $derived(
		data.size < 1024 ? `${data.size} B` : data.size < 1048576 ? `${(data.size / 1024).toFixed(1)} KB` : `${(data.size / 1048576).toFixed(1)} MB`
	);
</script>

<Breadcrumbs repo={data.repo.full_name} ref={data.ref} path={page.params.path ?? ''} />

<div class="file">
	<div class="bar">
		<span>{#if 'lines' in data}{data.lines} lines · {/if}{size}</span>
		<span class="actions">
			{#if data.kind === 'markdown'}<a href="?plain">Source</a>{:else if page.url.searchParams.has('plain')}<a href="?">Preview</a>{/if}
			<a href={raw}>Raw</a>
		</span>
	</div>
	{#if data.kind === 'code'}
		<div class="code">{@html data.html}</div>
	{:else if data.kind === 'plain'}
		<pre class="plain">{data.text}</pre>
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
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 1rem;
	}
	.code,
	.plain {
		overflow-x: auto;
		font-size: 0.85rem;
	}
	.plain {
		margin: 0;
		padding: 0.75rem 1rem;
		font-family: var(--mono);
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
</style>
