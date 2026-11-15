<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();
	const pages = $derived([
		['/settings/account', 'Account', 0],
		['/settings/appearance', 'Appearance', 0],
		['/settings/tokens', 'Tokens', 0],
		['/settings/keys', 'SSH keys', 0],
		['/settings/agents', 'Agents', data.waiting],
		...(data.user?.admin ? ([['/admin', 'Admin', 0]] as const) : [])
	] as const);
</script>

<div class="settings">
	<nav aria-label="Settings">
		<h2>Settings</h2>
		{#each pages as [href, label, count] (href)}
			<a {href} class:active={page.url.pathname.startsWith(href)} aria-current={page.url.pathname.startsWith(href) ? 'page' : undefined}>
				{label}{#if count}<b>{count}</b>{/if}
			</a>
		{/each}
	</nav>
	<div class="content">{@render children()}</div>
</div>

<style>
	.settings {
		display: grid;
		grid-template-columns: 11rem 1fr;
		gap: 2.5rem;
		align-items: start;
	}
	nav {
		display: grid;
		gap: 0.15rem;
	}
	h2 {
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	nav a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0.7rem;
		border-radius: 999px;
		color: var(--fg);
	}
	nav a:hover {
		background: var(--surface);
	}
	nav a.active {
		background: var(--accent-container);
		color: var(--on-accent-container);
		font-weight: 500;
	}
	b {
		padding: 0 0.45rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.75rem;
	}
	.content {
		min-width: 0;
	}
	.content :global(h1) {
		margin-top: 0;
	}
	@media (max-width: 700px) {
		.settings {
			grid-template-columns: 1fr;
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
		h2 {
			display: none;
		}
	}
</style>
