<script lang="ts">
	import MentionPicker from '#lib/components/MentionPicker.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let busy = $state(false);
	let mentionInput = $state<HTMLTextAreaElement>();
</script>

<h2>New issue</h2>

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
	<input name="title" placeholder="Title" value={form?.title ?? ''} aria-label="Title" required {@attach (el) => el.focus()} />
	<div class="compose">
		<textarea
	bind:this={mentionInput}
			name="body"
			placeholder="Describe it (Markdown supported)"
			rows="12"
			value={form?.body ?? ''}
			onkeydown={(e) => {
				if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
			}}
		></textarea>
<MentionPicker input={mentionInput} />
		<div class="bar">
			{#if form?.error}<span class="error">{form.error}</span>{/if}
			<span class="muted hint">Ctrl+Enter to create</span>
			<a class="button" href="/{data.repo.full_name}/issues">Cancel</a>
			<button class="primary" disabled={busy}>{busy ? 'Creating…' : 'Create issue'}</button>
		</div>
	</div>
</form>

<style>
	h2 {
		margin: 0 0 1rem;
		font-size: 1.3rem;
		font-weight: 600;
	}
	form {
		display: grid;
		gap: 0.75rem;
		max-width: 52rem;
	}
	input {
		font: inherit;
		font-size: 1.05rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.compose {
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.compose:focus-within {
		border-color: var(--accent);
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		padding: 0.75rem;
		font: inherit;
		background: var(--bg);
		color: var(--fg);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.hint {
		margin-right: auto;
		font-size: 0.8rem;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
