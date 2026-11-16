<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const p = $derived(data.pkg);
	const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
	const latest = $derived(p.versions[0]?.version.split('/')[0] ?? 'latest');
</script>

<svelte:head><title>{p.name} · Packages · {data.owner}</title></svelte:head>

<p class="crumbs"><a href="/{data.owner}">{data.owner}</a> / <a href="/{data.owner}/-/packages">Packages</a> / <strong>{p.name}</strong></p>
<h1>{p.name} <span class="tag">{p.type}</span>{#if p.private}<span class="tag">private</span>{/if}</h1>

{#if p.type === 'container'}
	<pre>docker pull {page.url.host}/{data.owner}/{p.name}:{latest}</pre>
{:else}
	<pre>curl -O {page.url.origin}/api/packages/{data.owner}/generic/{p.name}/{p.versions[0]?.version ?? '<version>/<file>'}</pre>
{/if}

<h2>{p.type === 'container' ? 'Tags' : 'Files'}</h2>
<ul class="list">
	{#each p.versions as v (v.version)}
		<li>
			<div>
				<strong>{v.version}</strong>
				<span class="muted small">{size(v.size)} · {ago(v.created_at)}{v.by ? ` by ${v.by.login}` : ''}</span>
				<code class="muted small">{v.digest.slice(0, 19)}</code>
			</div>
			{#if p.can_write}
				<form method="POST" action="?/deleteVersion" use:enhance onsubmit={(e) => confirm(`Delete ${v.version}?`) || e.preventDefault()}>
					<input type="hidden" name="version" value={v.version} />
					<button>Delete</button>
				</form>
			{/if}
		</li>
	{:else}
		<li class="muted">Nothing here yet.</li>
	{/each}
</ul>

{#if p.can_write}
	<h2>Settings</h2>
	<form method="POST" action="?/visibility" use:enhance class="row">
		<input type="hidden" name="private" value={p.private ? '0' : '1'} />
		<span>{p.private ? 'Only members can pull this.' : 'Anyone can pull this.'}</span>
		<button>Make it {p.private ? 'public' : 'private'}</button>
	</form>
	<form method="POST" action="?/delete" use:enhance class="row" onsubmit={(e) => confirm(`Delete ${p.name} and every version?`) || e.preventDefault()}>
		<span>Delete the package and all its versions.</span>
		<button class="danger">Delete package</button>
	</form>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{/if}

<style>
	.crumbs {
		margin: 0 0 0.5rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	h2 {
		margin-top: 1.8rem;
	}
	.tag {
		font-size: 0.75rem;
		font-weight: 400;
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--muted);
	}
	pre {
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		white-space: pre-wrap;
		word-break: break-all;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.7rem 1rem;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li > div {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.small {
		font-size: 0.85rem;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0;
	}
	.danger {
		color: var(--del-fg);
	}
	.error {
		color: var(--del-fg);
	}
</style>
