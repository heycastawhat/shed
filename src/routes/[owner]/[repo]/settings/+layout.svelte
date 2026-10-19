<script lang="ts">
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';

	let { data, children } = $props();
	const base = $derived(`/${data.repo.full_name}/settings`);
	const pages = $derived(
		[
			['', 'General', 'sliders'],
			['/merge', 'Merging', 'merge'],
			['/collaborators', 'Collaborators', 'group'],
			['/branches', 'Branches', 'branch'],
			['/tags', 'Tags', 'tag'],
			['/hooks', 'Webhooks', 'webhook'],
			['/keys', 'Deploy keys', 'key'],
			data.repo.has_actions && ['/actions', 'Actions', 'actions'],
			data.full.mirror && ['/mirror', 'Mirror', 'refresh'],
			['/danger', 'Danger zone', 'shield']
		].filter((p) => !!p) as [string, string, string][]
	);
	const here = (p: string) => (p ? page.url.pathname.startsWith(base + p) : page.url.pathname === base);
	const status = $derived(page.form as { error?: string; saved?: boolean } | null);
</script>

<div class="rs">
	<nav aria-label="Repository settings">
		{#each pages as [p, label, icon] (p)}
			<a href={base + p} class:active={here(p)} aria-current={here(p) ? 'page' : undefined}><Icon name={icon} size={15} />{label}</a>
		{/each}
		<a class="out" href={data.forgejo}>All settings in Forgejo<Icon name="external" size={13} /></a>
	</nav>
	<div class="content">
		{#if status?.error}<p class="flash error" role="alert">{status.error}</p>{:else if status?.saved}<p class="flash ok" role="status"><Icon name="check" size={14} />Saved</p>{/if}
		{@render children()}
	</div>
</div>

<style>
	.rs {
		display: grid;
		grid-template-columns: 12rem 1fr;
		gap: 2.5rem;
		align-items: start;
	}
	nav {
		display: grid;
		gap: 0.15rem;
		position: sticky;
		top: 1rem;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem;
		border-radius: 6px;
		color: var(--fg);
	}
	nav a:hover {
		background: var(--surface);
	}
	nav a.active {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
		font-weight: 500;
	}
	nav a.out {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.content {
		min-width: 0;
		max-width: 46rem;
	}
	.flash {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 1rem;
		padding: 0.5rem 0.8rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}
	.flash.error {
		border: 1px solid var(--del-fg);
		color: var(--del-fg);
	}
	.flash.ok {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--muted);
	}
	.content :global(h2) {
		margin: 0 0 0.3rem;
		font-size: 1.15rem;
	}
	.content :global(h3) {
		margin: 1.6rem 0 0.6rem;
		font-size: 0.95rem;
	}
	.content :global(.intro) {
		margin: 0 0 1.2rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.content :global(section) {
		margin-bottom: 2rem;
	}
	.content :global(form.stack) {
		display: grid;
		gap: 1rem;
	}
	.content :global(.field) {
		display: grid;
		gap: 0.3rem;
		font-size: 0.9rem;
	}
	.content :global(.field > span:first-child) {
		font-weight: 600;
	}
	.content :global(.field small),
	.content :global(.check small) {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.content :global(.row) {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.6rem;
	}
	.content :global(.row .field) {
		flex: 1;
		min-width: 10rem;
	}
	.content :global(input:not([type='checkbox']):not([type='radio'])),
	.content :global(select),
	.content :global(textarea) {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.content :global(textarea) {
		font-family: var(--mono);
		font-size: 0.85rem;
	}
	.content :global(.check) {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.content :global(.check input) {
		margin: 0.2rem 0 0;
	}
	.content :global(.check > span) {
		display: grid;
	}
	.content :global(.checks) {
		display: grid;
		gap: 0.7rem;
	}
	.content :global(.box) {
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.content :global(ul.box) {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.content :global(ul.box > li) {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.65rem 0.9rem;
		border-top: 1px solid var(--border);
	}
	.content :global(ul.box > li:first-child) {
		border-top: 0;
	}
	.content :global(ul.box .grow) {
		flex: 1;
		min-width: 0;
	}
	.content :global(.empty) {
		padding: 1.2rem;
		border: 1px dashed var(--border);
		border-radius: 8px;
		color: var(--muted);
		text-align: center;
	}
	.content :global(.actions) {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.content :global(button.danger) {
		color: var(--del-fg);
	}
	.content :global(button.danger:hover:not(:disabled)) {
		border-color: var(--del-fg);
	}
	.content :global(.mono) {
		font-family: var(--mono);
		font-size: 0.85rem;
	}
	@media (max-width: 760px) {
		.rs {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
		nav {
			position: static;
			grid-auto-flow: column;
			justify-content: start;
			overflow-x: auto;
		}
	}
</style>
