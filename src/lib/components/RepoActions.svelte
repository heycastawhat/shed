<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from './Icon.svelte';

	type Social = { stars: number; watchers: number; forks: number; starred: boolean; watching: boolean };
	let { repo, social, signedIn }: { repo: string; social: Social; signedIn: boolean } = $props();
	let busy = $state(false);

	// Plain form posts work without JS; with it, post in place and reload the data instead of the page.
	async function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();
		busy = true;
		await fetch(e.currentTarget.action, { method: 'POST', body: new FormData(e.currentTarget), redirect: 'manual' }).catch(() => null);
		await invalidateAll();
		busy = false;
	}
</script>

<div class="social">
	{#if signedIn}
		<form method="POST" action="/{repo}/follow" {onsubmit}>
			<input type="hidden" name="what" value="watch" />
			<input type="hidden" name="on" value={social.watching ? '0' : '1'} />
			<button class:on={social.watching} disabled={busy} title={social.watching ? 'Stop watching' : 'Get notified about activity here'}>
				<Icon name="eye" size={14} /><span class="label">{social.watching ? 'Watching' : 'Watch'}</span><span class="n">{social.watchers}</span>
			</button>
		</form>
		<a class="button" href="/{repo}/fork" title="Fork this repository"><Icon name="fork" size={14} /><span class="label">Fork</span><span class="n">{social.forks}</span></a>
		<form method="POST" action="/{repo}/follow" {onsubmit}>
			<input type="hidden" name="what" value="star" />
			<input type="hidden" name="on" value={social.starred ? '0' : '1'} />
			<button class:on={social.starred} disabled={busy} title={social.starred ? 'Unstar' : 'Star'}>
				<Icon name="star" size={14} /><span class="label">{social.starred ? 'Starred' : 'Star'}</span><span class="n">{social.stars}</span>
			</button>
		</form>
	{:else}
		<span class="button static" title="Forks"><Icon name="fork" size={14} /><span class="label">Forks</span><span class="n">{social.forks}</span></span>
		<span class="button static" title="Stars"><Icon name="star" size={14} /><span class="label">Stars</span><span class="n">{social.stars}</span></span>
	{/if}
</div>

<style>
	.social {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-left: auto;
		font-size: 0.8rem;
	}
	button,
	.button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.55rem;
		font-size: 0.8rem;
		color: var(--fg);
	}
	button.on :global(svg) {
		color: var(--accent);
	}
	.n {
		margin-left: 0.15rem;
		padding: 0 0.4rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		font-size: 0.72rem;
		color: var(--muted);
	}
	.static {
		cursor: default;
	}
	/* Phones: icon and count only, so they stay on the repo name's line. */
	@container (max-width: 560px) {
		.label {
			display: none;
		}
		.social {
			gap: 0.3rem;
		}
		button,
		.button {
			gap: 0.25rem;
			padding: 0.2rem 0.4rem;
		}
		.n {
			margin-left: 0;
			padding: 0 0.3rem;
		}
	}
</style>
