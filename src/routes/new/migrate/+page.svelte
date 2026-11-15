<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const v = $derived(form?.values);
	let busy = $state(false);
</script>

<svelte:head><title>Copy a repository</title></svelte:head>

<h1>Copy a repository</h1>
<p class="muted">Copy every branch and tag from another server by its HTTPS address, once or as a mirror that keeps following it. To bring over issues and PRs from Forgejo or Gitea too, use <code>shed import</code> (see DEPLOY.md).</p>

<form
	method="POST"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<label>Address <input name="url" value={v?.url ?? ''} required placeholder="https://github.com/owner/repo.git" /></label>
	<div class="two">
		<label>Username <input name="username" value={v?.username ?? ''} placeholder="for a private repo" autocomplete="off" /></label>
		<label>Token or password <input name="token" type="password" autocomplete="new-password" /></label>
	</div>
	<div class="two">
		<label>Owner <select name="owner" value={v?.owner ?? data.owners[0]}>{#each data.owners as o (o)}<option>{o}</option>{/each}</select></label>
		<label>Name <input name="name" value={v?.name ?? ''} placeholder="same as the original" /></label>
	</div>
	<label>Description <input name="description" value={v?.description ?? ''} /></label>
	<fieldset>
		<label class="check"><input type="radio" name="visibility" value="private" checked={v?.visibility !== 'public'} /> Private</label>
		<label class="check"><input type="radio" name="visibility" value="public" checked={v?.visibility === 'public'} /> Public</label>
	</fieldset>
	<label class="check"><input type="checkbox" name="mirror" checked={v?.mirror ?? false} /> Keep it as a mirror (read-only here, fetched again every</label>
	<label class="inline"><input name="interval" type="number" min="10" value={v?.interval ?? 480} /> minutes)</label>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	<button class="primary" disabled={busy}>{busy ? 'Copying…' : 'Copy repository'}</button>
</form>

<style>
	form {
		display: grid;
		gap: 0.9rem;
		max-width: 40rem;
	}
	label:not(.check):not(.inline) {
		display: grid;
		gap: 0.3rem;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}
	input:not([type='radio']):not([type='checkbox']),
	select {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	.inline input {
		width: 6rem;
	}
	fieldset {
		display: flex;
		gap: 1.2rem;
		border: 0;
		padding: 0;
		margin: 0;
	}
	input[type='radio'],
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	button {
		justify-self: start;
	}
	.error {
		color: var(--del-fg);
	}
	@media (max-width: 700px) {
		.two {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
