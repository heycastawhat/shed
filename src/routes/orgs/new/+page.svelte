<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	const v = $derived(form?.values);
	let busy = $state(false);
</script>

<svelte:head><title>New organization</title></svelte:head>

<h1>New organization</h1>
<p class="muted lead">An owner for repositories you share. Its members can push to all of them; its owners also run its settings. You'll be its first owner.</p>

<form
	method="POST"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<label class="field">
		<span>Name</span>
		<input name="username" value={v?.username ?? ''} required maxlength="100" pattern="[A-Za-z0-9][\w.\-]*" placeholder="my-team" autocomplete="off" {@attach (el) => el.focus()} />
		<small class="muted">Its address: letters, digits, '.', '-' and '_'.</small>
	</label>
	<label class="field">
		<span>Display name <em class="muted">(optional)</em></span>
		<input name="full_name" value={v?.full_name ?? ''} maxlength="100" />
	</label>
	<label class="field">
		<span>Description <em class="muted">(optional)</em></span>
		<input name="description" value={v?.description ?? ''} maxlength="255" placeholder="What is it for?" />
	</label>

	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<div class="actions">
		<button class="primary" disabled={busy}>{busy ? 'Creating…' : 'Create organization'}</button>
		<a href="/repos">Cancel</a>
	</div>
</form>

<style>
	.lead {
		max-width: 38rem;
		margin-top: -0.5rem;
	}
	form {
		display: grid;
		gap: 1.25rem;
		max-width: 38rem;
	}
	.field {
		display: grid;
		gap: 0.3rem;
		font-size: 0.9rem;
	}
	.field > span {
		font-weight: 600;
	}
	.field em {
		font-weight: 400;
	}
	input {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	.error {
		margin: 0;
		color: var(--del-fg);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
</style>
