<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const base = $derived(`/${data.repo.full_name}/wiki`);
	const canEdit = $derived(data.repo.permissions.push);
</script>

<svelte:head><title>{data.page?.title ?? 'Wiki'} · {data.repo.full_name}</title></svelte:head>

{#if !data.pages.length}
	<section class="empty">
		<Icon name="wiki" size={28} />
		<strong>This wiki has no pages yet</strong>
		{#if canEdit}<a class="btn" href="{data.forgejo}?action=_new" target="_blank" rel="noreferrer">Create the first page<Icon name="external" size={12} /></a>{/if}
	</section>
{:else}
	<div class="wiki">
		<article>
			{#if data.page}
				<header>
					<h2>{data.page.title}</h2>
					{#if data.page.updated}<span class="muted">Edited by {data.page.updated.by} {ago(data.page.updated.at)}</span>{/if}
					{#if canEdit}<a class="edit" href={data.page.edit} target="_blank" rel="noreferrer"><Icon name="pencil" size={13} />Edit in Forgejo</a>{/if}
				</header>
				<div class="markdown">{@html data.page.html}</div>
			{:else}
				<p class="muted">There's no page called “{data.name}”.</p>
			{/if}
		</article>
		<nav aria-label="Wiki pages">
			<h3>Pages</h3>
			{#each data.pages as p (p.sub_url)}
				<a href="{base}/{p.sub_url}" class:on={p.sub_url === data.page?.name}>{p.title}</a>
			{/each}
			{#if canEdit}<a class="muted" href="{data.forgejo}?action=_new" target="_blank" rel="noreferrer"><Icon name="plus" size={13} />New page</a>{/if}
		</nav>
	</div>
{/if}

<style>
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
