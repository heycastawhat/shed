<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();
	const base = $derived(`/${data.repo.full_name}/settings`);
	const pages = $derived([
		[base, 'General'],
		[`${base}/collaborators`, 'Collaborators'],
		[`${base}/branches`, 'Branches'],
		[`${base}/actions`, 'Actions'],
		[`${base}/hooks`, 'Webhooks']
	] as const);
	const current = (href: string) => (href === base ? page.url.pathname === base : page.url.pathname.startsWith(href));
</script>

<div class="settings">
	<nav aria-label="Repository settings">
		{#each pages as [href, label] (href)}
			<a {href} class:active={current(href)} aria-current={current(href) ? 'page' : undefined}>{label}</a>
		{/each}
	</nav>
	<div class="content">{@render children()}</div>
</div>

<style>
	.settings {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr);
		gap: 2.5rem;
		align-items: start;
	}
	nav {
		display: grid;
		gap: 0.15rem;
	}
	nav a {
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
	.content {
		min-width: 0;
		max-width: 48rem;
	}
	/* Shared by every settings page. */
	.content :global(h2) {
		margin: 0 0 0.25rem;
		font-size: 1.15rem;
	}
	.content :global(h3) {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}
	.content :global(.lead) {
		margin: 0 0 1rem;
		color: var(--muted);
	}
	.content :global(section + section) {
		margin-top: 2rem;
	}
	.content :global(.card) {
		display: grid;
		gap: 0.9rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.content :global(.field) {
		display: grid;
		gap: 0.3rem;
	}
	.content :global(.field > small),
	.content :global(.check small) {
		color: var(--muted);
	}
	.content :global(.check) {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.content :global(.check > span) {
		display: grid;
	}
	.content :global(.row) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
	}
	.content :global(.row > .field) {
		flex: 1 1 10rem;
		min-width: 0;
	}
	.content :global(:is(input:not([type='checkbox'], [type='radio'], [type='color']), select, textarea)) {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	.content :global(textarea) {
		resize: vertical;
	}
	.content :global(fieldset) {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}
	.content :global(legend) {
		padding: 0;
		margin-bottom: 0.4rem;
		font-weight: 500;
	}
	.content :global(.actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.content :global(.list) {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.content :global(.list > li) {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 0.7rem 1rem;
	}
	.content :global(.list > li + li) {
		border-top: 1px solid var(--border);
	}
	.content :global(.list > li.empty) {
		color: var(--muted);
		justify-content: center;
	}
	.content :global(.error) {
		margin: 0;
		color: var(--del-fg);
	}
	.content :global(.ok) {
		margin: 0;
		color: var(--muted);
	}
	.content :global(button.danger) {
		color: var(--del-fg);
	}
	.content :global(button.danger:hover:not(:disabled)) {
		border-color: var(--del-fg);
	}
	.content :global(details > summary) {
		cursor: pointer;
	}
	.content :global(code) {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	@media (max-width: 700px) {
		.settings {
			grid-template-columns: minmax(0, 1fr);
			gap: 1rem;
		}
		nav {
			grid-auto-flow: column;
			justify-content: start;
			overflow-x: auto;
		}
		nav a {
			white-space: nowrap;
		}
	}
</style>
