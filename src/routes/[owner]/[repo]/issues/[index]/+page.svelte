<script lang="ts">
	import MentionPicker from '#lib/components/MentionPicker.svelte';
	import { enhance } from '$app/forms';
	import Byline from '#lib/components/Byline.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import IssueState from '#lib/components/IssueState.svelte';
	import ThreadItem from '#lib/components/ThreadItem.svelte';
	import ThreadSide from '#lib/components/ThreadSide.svelte';
	import Triage from '#lib/components/Triage.svelte';
	import EditTitle from '#lib/components/EditTitle.svelte';
	import Description from '#lib/components/Description.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const i = $derived(data.issue);
	const can = $derived(data.repo.permissions.push || i.user.id === data.user?.id);
	const comments = $derived(data.thread.items.filter((e) => e.type === 'comment').length);
	const locked = $derived(!!i.is_locked && !data.repo.permissions.push);
	let busy = $state(false);
	let draft = $state('');
	const close = $derived(i.state === 'open');
	let mentionInput = $state<HTMLTextAreaElement>();
	function quote(text: string) {
		draft = (draft.trim() ? `${draft.trimEnd()}\n\n` : '') + text;
		mentionInput?.focus();
		mentionInput?.scrollIntoView({ block: 'center' });
	}
</script>

<svelte:head><title>{i.title} · #{i.number} · {data.repo.full_name}</title></svelte:head>

<div class="head">
	<EditTitle title={i.title} number={i.number} {can} action="?/edit" />
	<div class="meta">
		<IssueState state={i.state} />
		<span><Byline login={i.user.login} agent={data.description.agent} /> opened this {ago(i.created_at)} · {comments} comment{comments === 1 ? '' : 's'}</span>
	</div>
</div>

<div class="layout">
	<div>
		<ol class="timeline">
			<li>
				<img class="avatar" src={i.user.avatar_url} alt="" />
				<Description login={i.user.login} agent={data.description.agent} created={i.created_at} html={data.description.html} body={i.body} {can} reactions={data.thread.reactions} signedIn={!!data.user} onquote={quote} />
			</li>
			{#each data.thread.items as e (e.id)}
				<ThreadItem item={e} repo={data.repo.full_name} me={data.user?.login} admin={data.repo.permissions.admin} onquote={quote} />
			{/each}
		</ol>

		{#if locked}
			<p class="locked muted"><Icon name="lock" size={14} />This conversation is locked; only people with write access can comment.</p>
		{:else if data.user}
		<form
			class="compose"
			method="POST"
			action="?/comment"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') draft = '';
					busy = false;
				};
			}}
		>
			<textarea
	bind:this={mentionInput}
				name="body"
				bind:value={draft}
				placeholder="Leave a comment (Markdown supported)"
				rows="4"
				onkeydown={(e) => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
				}}
			></textarea>
<MentionPicker input={mentionInput} />
			<div class="compose-bar">
				{#if form?.error && form.action === 'comment'}<span class="error">{form.error}</span>{/if}
				<span class="muted hint">Ctrl+Enter to send</span>
				{#if can}
					<input type="hidden" name="to" value={close ? 'closed' : 'open'} />
					<button formaction="?/state" disabled={busy}>
						<Icon name={close ? 'done' : 'issue'} size={14} />{close ? (draft.trim() ? 'Close with comment' : 'Close issue') : draft.trim() ? 'Reopen with comment' : 'Reopen'}
					</button>
				{/if}
				<button class="primary" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Comment'}</button>
			</div>
		</form>
		{/if}
	</div>

	<aside>
		<Triage item={i} options={data.options} can={data.repo.permissions.push} list="/{data.repo.full_name}/issues" />
		<ThreadSide subscribed={data.thread.subscribed} locked={!!i.is_locked} pinned={!!i.pin_order} signedIn={!!data.user} can={data.repo.permissions.push} />
	</aside>
</div>

<style>
	.head {
		margin-bottom: 1.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15rem;
		gap: 2rem;
		align-items: start;
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.timeline {
		position: relative;
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1.25rem;
	}
	.timeline::before {
		content: '';
		position: absolute;
		top: 1rem;
		bottom: 1rem;
		left: 15px;
		border-left: 2px solid var(--border);
	}
	.timeline > li {
		position: relative;
		display: grid;
		grid-template-columns: 32px 1fr;
		gap: 0.9rem;
		align-items: start;
	}
	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg);
		box-shadow: 0 0 0 4px var(--bg);
	}
	.compose {
		margin-top: 1.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
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
		padding: 0.75rem 1rem;
		font: inherit;
		background: var(--bg);
		color: var(--fg);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
	}
	.compose-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.compose-bar button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.hint {
		margin-right: auto;
		font-size: 0.8rem;
	}
	.locked {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
	@media (max-width: 700px) {
		.compose-bar {
			flex-wrap: wrap;
			row-gap: 0.4rem;
		}
		.hint {
			display: none;
		}
	}
</style>
