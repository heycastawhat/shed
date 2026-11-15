<script lang="ts">
	import { enhance } from '$app/forms';
	import CommitBox from './CommitBox.svelte';

	let {
		ref,
		path,
		text = '',
		sha = '',
		login,
		error,
		cancel,
		isNew = false
	}: { ref: string; path: string; text?: string; sha?: string; login: string; error?: string; cancel: string; isNew?: boolean } = $props();
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let name = $state(path);
	const changed = $derived(!isNew && name !== path);

	// Tab indents instead of leaving the editor.
	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
		e.preventDefault();
		const t = e.currentTarget;
		t.setRangeText('\t', t.selectionStart, t.selectionEnd, 'end');
	}
</script>

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
	<div class="file">
		<div class="bar">
			<input
				class="path"
				name="path"
				bind:value={name}
				aria-label="File path"
				placeholder="path/to/file.txt"
				required
				spellcheck="false"
				{@attach (el) => {
					if (isNew) (el.focus(), el.setSelectionRange(el.value.length, el.value.length));
				}}
			/>
			{#if changed}<span class="muted note">Moves {path}</span>{/if}
		</div>
		<input type="hidden" name="sha" value={sha} />
		<textarea name="content" value={text} {onkeydown} spellcheck="false" aria-label="File contents" rows="24"></textarea>
	</div>
	<CommitBox {ref} {login} {error} {busy} {cancel} placeholder={isNew ? `Add ${name || 'file'}` : changed ? `Rename ${path} to ${name}` : `Update ${path}`} />
</form>

<style>
	form {
		display: grid;
		gap: 1rem;
	}
	.file {
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.file:focus-within {
		border-color: var(--accent);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.path {
		flex: 1;
		min-width: 0;
		font-family: var(--mono);
		font-size: 0.85rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.path:focus {
		outline: none;
		border-color: var(--accent);
	}
	.note {
		font-size: 0.8rem;
		white-space: nowrap;
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 24rem;
		border: 0;
		padding: 0.75rem 1rem;
		font-family: var(--mono);
		font-size: 0.85rem;
		line-height: 1.5;
		tab-size: 4;
		background: var(--bg);
		color: var(--fg);
		resize: vertical;
		white-space: pre;
		overflow-wrap: normal;
	}
	textarea:focus {
		outline: none;
	}
	@media (max-width: 700px) {
		.note {
			display: none;
		}
	}
</style>
