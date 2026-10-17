<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const v = $derived(form?.values);
	let busy = $state(false);
</script>

<h1>New repository</h1>

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
	<div class="name">
		<label class="field owner">
			<span>Owner</span>
			<select name="owner" value={v?.owner ?? data.owners[0]}>
				{#each data.owners as o (o)}<option>{o}</option>{/each}
			</select>
		</label>
		<span class="slash">/</span>
		<label class="field grow">
			<span>Repository name</span>
			<input name="name" value={v?.name ?? ''} required maxlength="100" pattern="[\w.\-]+" placeholder="my-project" {@attach (el) => el.focus()} />
		</label>
	</div>

	<label class="field">
		<span>Description <em class="muted">(optional)</em></span>
		<input name="description" value={v?.description ?? ''} placeholder="What is it for?" />
	</label>

	<fieldset>
		<legend>Visibility</legend>
		<label class="choice">
			<input type="radio" name="visibility" value="private" checked={v?.visibility !== 'public'} />
			<span><strong>Private</strong><span class="muted">Only you and people you add can see it</span></span>
		</label>
		<label class="choice">
			<input type="radio" name="visibility" value="public" checked={v?.visibility === 'public'} />
			<span><strong>Public</strong><span class="muted">Anyone who can reach this forge can see it</span></span>
		</label>
	</fieldset>

	<fieldset>
		<legend>Start with</legend>
		<label class="check"><input type="checkbox" name="readme" checked={v ? v.readme : true} /> A README</label>
		<div class="two">
			<label class="field">
				<span>.gitignore</span>
				<select name="gitignore" value={v?.gitignore ?? ''}>
					<option value="">None</option>
					{#each data.gitignores as g (g)}<option>{g}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span>License</span>
				<select name="license" value={v?.license ?? ''}>
					<option value="">None</option>
					{#each data.licenses as l (l.key)}<option value={l.key}>{l.name}</option>{/each}
				</select>
			</label>
		</div>
		<label class="field branch">
			<span>Default branch</span>
			<input name="branch" value={v?.branch ?? 'main'} />
		</label>
		<p class="muted note">With nothing ticked the repository starts empty, and forge shows you the commands to push an existing project into it.</p>
	</fieldset>

	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<div class="actions">
		<button class="primary" disabled={busy}>{busy ? 'Creating…' : 'Create repository'}</button>
		<a href="/repos">Cancel</a>
	</div>
</form>

<style>
	form {
		display: grid;
		gap: 1.25rem;
		max-width: 38rem;
	}
	.name {
		display: flex;
		align-items: end;
		gap: 0.5rem;
	}
	.slash {
		padding-bottom: 0.45rem;
		color: var(--muted);
		font-size: 1.2rem;
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
	.grow {
		flex: 1;
	}
	input:not([type='radio']):not([type='checkbox']),
	select {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	input:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	fieldset {
		display: grid;
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: 0.5rem;
		padding: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.choice,
	.check {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
	}
	.check {
		align-items: center;
	}
	.choice:has(input:checked) {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.choice span:last-child {
		display: grid;
		font-size: 0.9rem;
	}
	input[type='radio'],
	input[type='checkbox'] {
		accent-color: var(--accent);
		margin-top: 0.2rem;
	}
	.check input {
		margin-top: 0;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
	.branch {
		max-width: 14rem;
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
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
