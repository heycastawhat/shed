<script lang="ts">
	import Icon from './Icon.svelte';

	let { ref, placeholder, login, error, busy, label = 'Commit changes', cancel }: { ref: string; placeholder: string; login: string; error?: string; busy: boolean; label?: string; cancel: string } =
		$props();
	let target = $state<'current' | 'new'>('current');
	let pr = $state(true);
	// svelte-ignore state_referenced_locally
	let branch = $state(`${login}-patch-1`);
</script>

<fieldset class="commit">
	<legend>Commit</legend>
	<input name="message" {placeholder} aria-label="Commit message" />
	<label class="choice"><input type="radio" name="target" value="current" bind:group={target} />Commit directly to <code>{ref}</code></label>
	<label class="choice"><input type="radio" name="target" value="new" bind:group={target} /><Icon name="branch" size={14} />Create a new branch for this commit</label>
	{#if target === 'new'}
		<div class="newbranch">
			<input name="new_branch" bind:value={branch} aria-label="New branch name" required />
			<label class="choice"><input type="checkbox" name="pr" bind:checked={pr} />Then open a pull request</label>
		</div>
	{/if}
	<div class="bar">
		{#if error}<span class="error">{error}</span>{/if}
		<a class="button" href={cancel}>Cancel</a>
		<button class="primary" disabled={busy}>{busy ? 'Committing…' : target === 'new' && pr ? 'Commit and open PR' : label}</button>
	</div>
</fieldset>

<style>
	.commit {
		display: grid;
		gap: 0.6rem;
		margin: 0;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		min-width: 0;
	}
	legend {
		padding: 0 0.3rem;
		font-weight: 600;
	}
	input:not([type]),
	input[name='new_branch'] {
		min-width: 0;
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.9rem;
	}
	.choice code {
		font-family: var(--mono);
		font-size: 0.85rem;
		padding: 0 0.3rem;
		border-radius: 4px;
		background: var(--surface);
	}
	.newbranch {
		display: grid;
		gap: 0.5rem;
		padding-left: 1.6rem;
	}
	.newbranch input {
		font-family: var(--mono);
		font-size: 0.85rem;
		max-width: 24rem;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.error {
		margin-right: auto;
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
