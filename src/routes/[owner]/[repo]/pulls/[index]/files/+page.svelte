<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import DiffView from '#lib/components/DiffView.svelte';
	import type { Draft } from '#lib/diff.js';

	let { data, form } = $props();
	const key = $derived(`review:${data.repo.full_name}#${data.pull.number}`);
	const own = $derived(data.pull.user.id === data.user?.id);
	let pending = $state<Draft[]>([]);
	let summary = $state('');
	let submitting = $state(false);

	onMount(() => {
		try {
			pending = JSON.parse(localStorage.getItem(key) ?? '[]');
		} catch {}
	});

	function save(next: Draft[]) {
		pending = next;
		try {
			if (next.length) localStorage.setItem(key, JSON.stringify(next));
			else localStorage.removeItem(key);
		} catch {}
	}
</script>

<DiffView
	files={data.files}
	comments={data.comments}
	resolved={data.resolved}
	agents={data.agents}
	commentError={form?.action === 'comment' ? form.error : undefined}
	{pending}
	onpend={(d) => save([...pending, d])}
	onunpend={(d) => save(pending.filter((p) => p !== d))}
	viewedKey="viewed:{data.repo.full_name}#{data.pull.number}"
	source="/{data.repo.full_name}/lines/{data.pull.head.sha}"
/>

{#if pending.length}
	<form
		class="review"
		method="POST"
		action="?/review"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'success') {
					save([]);
					summary = '';
				}
			};
		}}
	>
		<input type="hidden" name="comments" value={JSON.stringify(pending)} />
		<textarea name="body" rows="2" bind:value={summary} placeholder="Leave a summary (optional)"></textarea>
		<div class="bar">
			<strong>{pending.length} pending comment{pending.length > 1 ? 's' : ''}</strong>
			{#if form?.action === 'review'}<span class="error">{form.error}</span>{/if}
			<button name="event" value="COMMENT" class:primary={own} disabled={submitting}>Comment</button>
			{#if !own}
				<button name="event" value="REQUEST_CHANGES" disabled={submitting}>Request changes</button>
				<button name="event" value="APPROVED" class="primary" disabled={submitting}>Approve</button>
			{/if}
		</div>
	</form>
{/if}

<style>
	.review {
		position: sticky;
		bottom: 1rem;
		margin-top: 1rem;
		border: 1px solid var(--accent);
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg);
		box-shadow: 0 4px 24px rgb(0 0 0 / 0.25);
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		padding: 0.6rem 1rem;
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
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	strong {
		margin-right: auto;
		font-size: 0.9rem;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
