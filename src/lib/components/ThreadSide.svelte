<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';

	// Notifications, lock and pin for an issue or PR's sidebar.
	let { subscribed, locked, pinned, signedIn, can }: { subscribed: boolean; locked: boolean; pinned: boolean; signedIn: boolean; can: boolean } = $props();
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const err = $derived(page.form && ['subscribe', 'lock', 'pin'].includes(page.form.action) ? page.form.error : '');
</script>

{#if signedIn}
	<section>
		<h3>Notifications</h3>
		<form class="sub" method="POST" action="?/subscribe" use:enhance={keep}>
			{#if subscribed}<input type="hidden" name="undo" />{/if}
			<button><Icon name={subscribed ? 'bell-off' : 'bell'} size={14} />{subscribed ? 'Unsubscribe' : 'Subscribe'}</button>
		</form>
		<p class="muted small">{subscribed ? "You're getting notified of activity here." : "You're not getting notified of activity here."}</p>
		{#if can}
			<div class="row">
				<form method="POST" action="?/lock" use:enhance={keep}>
					{#if locked}<input type="hidden" name="undo" />{/if}
					<button class="ghost"><Icon name={locked ? 'unlock' : 'lock'} size={14} />{locked ? 'Unlock conversation' : 'Lock conversation'}</button>
				</form>
				<form method="POST" action="?/pin" use:enhance={keep}>
					{#if pinned}<input type="hidden" name="undo" />{/if}
					<button class="ghost"><Icon name="pin" size={14} />{pinned ? 'Unpin' : 'Pin to the top of the list'}</button>
				</form>
			</div>
		{/if}
		{#if err}<p class="error">{err}</p>{/if}
	</section>
{/if}

<style>
	section {
		margin-top: 1.25rem;
	}
	h3 {
		margin: 0 0 0.6rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}
	.sub button {
		width: 100%;
		justify-content: center;
	}
	.small {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
	}
	.row {
		display: grid;
		gap: 0.1rem;
		margin-top: 0.75rem;
	}
	.ghost {
		padding: 0.2rem 0;
		border-color: transparent;
		background: none;
		color: var(--muted);
	}
	.ghost:hover {
		color: var(--accent);
	}
	.error {
		color: var(--del-fg);
		font-size: 0.85rem;
	}
</style>
