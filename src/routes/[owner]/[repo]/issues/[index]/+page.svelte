<script lang="ts">
	import MentionPicker from '#lib/components/MentionPicker.svelte';
	import { enhance } from '$app/forms';
	import Byline from '#lib/components/Byline.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import IssueState from '#lib/components/IssueState.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import Triage from '#lib/components/Triage.svelte';
	import EditTitle from '#lib/components/EditTitle.svelte';
	import Description from '#lib/components/Description.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const i = $derived(data.issue);
	const can = $derived(data.repo.permissions.push || i.user.id === data.user?.id);
	const comments = $derived(data.timeline.filter((e) => e.type === 'comment').length);
	let busy = $state(false);
	let draft = $state('');
	const close = $derived(i.state === 'open');
	let mentionInput = $state<HTMLTextAreaElement>();
</script>

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
				<Description login={i.user.login} agent={data.description.agent} created={i.created_at} html={data.description.html} body={i.body} {can} />
			</li>
			{#each data.timeline as e (e.id)}
				{#if e.type === 'comment'}
					<li>
						<img class="avatar" src={e.user.avatar_url} alt="" />
						<div class="card">
							<div class="who"><Byline bold login={e.user.login} agent={e.agent} /> commented {ago(e.date)}</div>
							<article class="markdown">{@html e.html}</article>
						</div>
					</li>
				{:else}
					<li class="event">
						<span class="dot {e.type}"><Icon name={{ close: 'done', reopen: 'issue', label: 'tag', assignees: 'user', milestone: 'milestone' }[e.type] ?? 'pencil'} size={e.type === 'close' || e.type === 'reopen' ? 16 : 14} /></span>
						<p>
							<strong>{e.user.login}</strong>
							{#if e.type === 'close'}closed this
							{:else if e.type === 'reopen'}reopened this
							{:else if e.type === 'label' && e.label}{e.added ? 'added' : 'removed'} <LabelChip label={e.label} />
							{:else if e.type === 'assignees'}{#if e.assignee === e.user.login}{e.unassigned ? 'removed their assignment' : 'self-assigned this'}{:else}{e.unassigned ? 'unassigned' : 'assigned'} <strong>{e.assignee}</strong>{/if}
							{:else if e.milestone}{#if e.milestone.to && e.milestone.from}moved this from <strong>{e.milestone.from}</strong> to <strong>{e.milestone.to}</strong>{:else if e.milestone.to}added this to <strong>{e.milestone.to}</strong>{:else}removed this from <strong>{e.milestone.from}</strong>{/if}
							{:else if e.title}changed the title from <s>{e.title.from}</s> to <strong>{e.title.to}</strong>{/if}
							{ago(e.date)}
						</p>
					</li>
				{/if}
			{/each}
		</ol>

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
	</div>

	<aside><Triage item={i} options={data.options} can={data.repo.permissions.push} list="/{data.repo.full_name}/issues" /></aside>
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
	.event {
		align-items: center !important;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.event + .event {
		margin-top: -0.6rem;
	}
	.event p {
		margin: 0;
	}
	.event strong {
		color: var(--fg);
	}
	.dot {
		display: grid;
		place-items: center;
		justify-self: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--muted);
		box-shadow: 0 0 0 4px var(--bg);
	}
	.dot.close,
	.dot.reopen {
		width: 32px;
		height: 32px;
		border: 0;
		color: var(--bg);
	}
	.dot.close {
		background: var(--del-fg);
	}
	.dot.reopen {
		background: var(--accent);
	}
	.card {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		font-size: 0.85rem;
		color: var(--muted);
	}
	.who :global(strong) {
		color: var(--fg);
	}
	.markdown {
		padding: 1rem;
		margin: 0;
	}
	.compose {
		margin-top: 1.5rem;
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
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
	@media (max-width: 700px) {
		.who,
		.compose-bar {
			flex-wrap: wrap;
			row-gap: 0.4rem;
		}
		.hint {
			display: none;
		}
	}
</style>
