<script lang="ts">
	import MentionPicker from './MentionPicker.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { unsign } from '#lib/sign.js';
	import { ago } from '#lib/time.js';
	import Byline from './Byline.svelte';
	import Icon from './Icon.svelte';
	import Reactions from './Reactions.svelte';

	let {
		login,
		agent,
		agentHref,
		created,
		html,
		body,
		can,
		reactions,
		signedIn = false,
		onquote
	}: {
		login: string;
		agent?: string;
		agentHref?: string;
		created: string;
		html: string;
		body: string;
		can: boolean;
		reactions?: { content: string; users: string[]; mine: boolean }[];
		signedIn?: boolean;
		onquote?: (text: string) => void;
	} = $props();
	let editing = $state(false);
	let busy = $state(false);
	let draft = $state('');
	let mentionInput = $state<HTMLTextAreaElement>();
</script>

<div class="card">
	<div class="who">
		<Byline bold {login} {agent} href={agentHref} /> opened this {ago(created)}
		<span class="tools">
		{#if onquote && signedIn && body.trim() && !editing}
			<button class="edit" onclick={() => onquote(`> ${(getSelection()?.toString().trim() || unsign(body).body.trim()).replaceAll('\n', '\n> ')}\n\n`)}><Icon name="quote" size={13} />Quote</button>
		{/if}
		{#if can && !editing}
			<button
				class="edit"
				onclick={() => {
					draft = unsign(body).body;
					editing = true;
				}}><Icon name="pencil" size={13} />Edit</button
			>
		{/if}
		</span>
	</div>
	{#if editing}
		<form
			method="POST"
			action="?/edit"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') editing = false;
					busy = false;
				};
			}}
		>
			<textarea
	bind:this={mentionInput}
				name="body"
				bind:value={draft}
				rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
				placeholder="Add a description (Markdown supported)"
				{@attach (el) => el.focus()}
				onkeydown={(e) => {
					if (e.key === 'Escape') editing = false;
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
				}}
			></textarea>
<MentionPicker input={mentionInput} />
			<div class="bar">
				{#if page.form?.error && page.form.action === 'body'}<span class="error">{page.form.error}</span>{/if}
				<span class="muted hint">Ctrl+Enter to save, Esc to cancel</span>
				<button type="button" onclick={() => (editing = false)}>Cancel</button>
				<button class="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
			</div>
		</form>
	{:else if html}
		<article class="markdown">{@html html}</article>
	{:else}
		<p class="muted markdown">No description provided.</p>
	{/if}
	{#if reactions && !editing}<Reactions {reactions} can={signedIn} />{/if}
</div>

<style>
	.card {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.card:focus-within {
		border-color: var(--accent);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-radius: 8px 8px 0 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.who :global(strong) {
		color: var(--fg);
	}
	.edit {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.5rem;
		border-color: transparent;
		background: none;
		color: var(--muted);
		font-size: 0.8rem;
	}
	.tools {
		display: flex;
		margin-left: auto;
	}
	.edit:hover {
		color: var(--accent);
	}
	.markdown {
		padding: 1rem;
		margin: 0;
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		padding: 0.75rem 1rem;
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
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
		border-radius: 0 0 8px 8px;
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
