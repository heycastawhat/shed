<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { Repo } from '#lib/server/forgejo.js';
	import { ago } from '#lib/time.js';

	let { repos, pins, children }: { repos: Repo[]; pins: string[]; children?: Snippet } = $props();
	const pinned = $derived(new Set(pins));
</script>

<ul>
	{#each repos as repo (repo.id)}
		<li>
			<div class="row">
				<div>
					<a href="/{repo.full_name}"><span class="owner">{repo.owner.login}/</span>{repo.name}</a>
					{#if repo.private}<span class="tag"><Icon name="lock" size={11} /> private</span>{/if}
					{#if repo.empty}<span class="tag">empty</span>{/if}
					{#if repo.description}<p>{repo.description}</p>{/if}
				</div>
				<div class="side">
					<span class="muted">updated {ago(repo.updated_at)}</span>
					<form method="POST" action="/pin">
						<input type="hidden" name="repo" value={repo.full_name} />
						<input type="hidden" name="pin" value={pinned.has(repo.full_name) ? '0' : '1'} />
						<button class="pin" class:on={pinned.has(repo.full_name)} title={pinned.has(repo.full_name) ? 'Unpin from sidebar' : 'Pin to sidebar'}>
							<Icon name="pin" size={13} />{pinned.has(repo.full_name) ? 'Pinned' : 'Pin'}
						</button>
					</form>
				</div>
			</div>
		</li>
	{:else}
		<li class="empty">{@render children?.()}</li>
	{/each}
</ul>

<style>
	ul {
		list-style: none;
		padding: 0;
		margin-top: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	li {
		padding: 0.9rem 1rem;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.side {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.pin {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.55rem;
		border-color: transparent;
		background: none;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.pin.on {
		color: var(--accent);
	}
	.row > div > a {
		color: var(--fg);
		font-weight: 600;
	}
	.row > div > a:hover {
		color: var(--accent);
	}
	.owner {
		color: var(--muted);
		font-weight: 400;
	}
	p {
		margin: 0.3rem 0 0;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.empty {
		text-align: center;
		padding: 2.5rem 1rem;
	}
	.empty :global(p) {
		margin: 0.3rem 0 0;
		color: var(--muted);
	}
	.empty :global(.button) {
		display: inline-block;
		margin-top: 0.8rem;
	}
</style>
