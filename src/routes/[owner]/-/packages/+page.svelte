<script lang="ts">
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	let { data } = $props();
</script>

<svelte:head><title>Packages · {data.owner}</title></svelte:head>

<p class="crumbs"><a href="/{data.owner}">{data.owner}</a> / <strong>Packages</strong></p>

{#if data.packages.length}
	<ul class="list">
		{#each data.packages as p (p.id)}
			<li>
				<Icon name={p.type === 'container' ? 'package' : 'file'} size={16} />
				<a href="/{data.owner}/-/packages/{p.type}/{p.name}"><strong>{p.name}</strong></a>
				<span class="tag">{p.type}</span>
				{#if p.private}<span class="tag">private</span>{/if}
				<span class="muted when">updated {ago(p.updated_at)}</span>
			</li>
		{/each}
	</ul>
{:else}
	<section class="empty">
		<strong>No packages yet</strong>
		<p class="muted">Push a container image:</p>
		<pre>docker login {page.url.host}
docker tag my-image {page.url.host}/{data.owner}/my-image:latest
docker push {page.url.host}/{data.owner}/my-image:latest</pre>
		<p class="muted">or upload a file: <code>curl --user {data.owner}:&lt;token&gt; --upload-file ./app.tar.gz {page.url.origin}/api/packages/{data.owner}/generic/app/1.0.0/app.tar.gz</code></p>
	</section>
{/if}

<style>
	.crumbs {
		margin: 0 0 1rem;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 1rem;
		flex-wrap: wrap;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.tag {
		font-size: 0.75rem;
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--muted);
	}
	.when {
		margin-left: auto;
		font-size: 0.85rem;
	}
	.empty {
		border: 1px dashed var(--border);
		border-radius: 8px;
		padding: 1.5rem;
	}
	pre {
		padding: 0.75rem 1rem;
		background: var(--surface);
		border-radius: 6px;
		overflow-x: auto;
	}
	code {
		word-break: break-all;
	}
</style>
