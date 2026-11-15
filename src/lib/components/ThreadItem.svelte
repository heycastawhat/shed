<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ThreadItem } from '#lib/server/thread.js';
	import { ago } from '#lib/time.js';
	import Byline from './Byline.svelte';
	import Icon from './Icon.svelte';
	import LabelChip from './LabelChip.svelte';
	import MentionPicker from './MentionPicker.svelte';
	import Reactions from './Reactions.svelte';

	// One timeline entry: a comment card (edit, delete, quote, react) or an event line.
	let { item: e, repo, me, admin = false, onquote }: { item: ThreadItem; repo: string; me?: string; admin?: boolean; onquote?: (text: string) => void } = $props();
	let editing = $state(false);
	let draft = $state('');
	let busy = $state(false);
	let menu = $state<HTMLDetailsElement>();
	let input = $state<HTMLTextAreaElement>();
	const mine = $derived(!!me && e.user.login === me);
	const action = $derived(`comment-${e.id}`);
	const short = (sha?: string) => sha?.slice(0, 7);
	const ICON: Record<string, string> = {
		close: 'done', reopen: 'issue', label: 'tag', assignees: 'user', milestone: 'milestone', issue_ref: 'link', pull_ref: 'link', lock: 'lock', unlock: 'unlock',
		review_request: 'eye', draft: 'pencil', ready_for_review: 'eye', change_target_branch: 'branch', pull_push: 'commit', merge_pull: 'merge', delete_branch: 'trash',
		pull_scheduled_merge: 'clock', pull_cancel_scheduled_merge: 'clock', dismiss_review: 'x'
	};
	const big = $derived(['close', 'reopen', 'merge_pull'].includes(e.type));

	function quote() {
		if (menu) menu.open = false;
		const sel = getSelection()?.toString().trim();
		onquote?.(`> ${(sel || e.body || '').trim().replaceAll('\n', '\n> ')}\n\n`);
	}
	function copyLink() {
		if (menu) menu.open = false;
		navigator.clipboard?.writeText(`${location.origin}${location.pathname}#issuecomment-${e.id}`);
	}
</script>

<svelte:window onclick={(ev) => menu?.open && !menu.contains(ev.target as Node) && (menu.open = false)} />

{#if e.type === 'comment'}
	<li id="issuecomment-{e.id}" class="comment">
		<img class="avatar" src={e.user.avatar_url} alt="" />
		<div class="card">
			<div class="who">
				<Byline bold login={e.user.login} agent={e.agent} />
				<span>commented <a class="when" href="#issuecomment-{e.id}" title={e.date}>{ago(e.date)}</a>{e.edited ? ' · edited' : ''}</span>
				{#if me}
					<details class="more" bind:this={menu}>
						<summary aria-label="Comment actions"><Icon name="more" size={16} /></summary>
						<div class="panel">
							{#if onquote}<button onclick={quote}><Icon name="quote" size={14} />Quote reply</button>{/if}
							<button onclick={copyLink}><Icon name="link" size={14} />Copy link</button>
							{#if mine || admin}
								<button
									onclick={() => {
										if (menu) menu.open = false;
										draft = e.body ?? '';
										editing = true;
									}}><Icon name="pencil" size={14} />Edit</button
								>
								<form
									method="POST"
									action="?/deleteComment"
									use:enhance={({ cancel }) => {
										if (!confirm('Delete this comment?')) return cancel();
										return async ({ update }) => update({ reset: false });
									}}
								>
									<input type="hidden" name="id" value={e.id} />
									<button class="danger"><Icon name="trash" size={14} />Delete</button>
								</form>
							{/if}
						</div>
					</details>
				{/if}
			</div>
			{#if editing}
				<form
					method="POST"
					action="?/editComment"
					use:enhance={() => {
						busy = true;
						return async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') editing = false;
							busy = false;
						};
					}}
				>
					<input type="hidden" name="id" value={e.id} />
					<textarea
						bind:this={input}
						name="body"
						bind:value={draft}
						rows={Math.min(20, Math.max(4, draft.split('\n').length + 1))}
						{@attach (el) => el.focus()}
						onkeydown={(k) => {
							if (k.key === 'Escape') editing = false;
							if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) k.currentTarget.form?.requestSubmit();
						}}
					></textarea>
					<MentionPicker {input} />
					<div class="bar">
						{#if page.form?.action === action}<span class="error">{page.form.error}</span>{/if}
						<span class="muted hint">Ctrl+Enter to save, Esc to cancel</span>
						<button type="button" onclick={() => (editing = false)}>Cancel</button>
						<button class="primary" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Save'}</button>
					</div>
				</form>
			{:else}
				{#if e.html}<article class="markdown">{@html e.html}</article>{/if}
				{#if page.form?.action === action}<p class="error pad">{page.form.error}</p>{/if}
				<Reactions reactions={e.reactions ?? []} id={e.id} can={!!me} />
			{/if}
		</div>
	</li>
{:else}
	<li class="event" id="event-{e.id}">
		<span class="dot {e.type}" class:big><Icon name={ICON[e.type] ?? 'pencil'} size={big ? 16 : 14} /></span>
		<p>
			<strong>{e.user.login}</strong>
			{#if e.type === 'close'}closed this
			{:else if e.type === 'reopen'}reopened this
			{:else if e.type === 'label' && e.label}{e.added ? 'added' : 'removed'} <LabelChip label={e.label} />
			{:else if e.type === 'assignees'}{#if e.who === e.user.login}{e.removed ? 'removed their assignment' : 'self-assigned this'}{:else}{e.removed ? 'unassigned' : 'assigned'} <strong>{e.who}</strong>{/if}
			{:else if e.type === 'review_request'}{e.removed ? 'removed the review request for' : 'requested a review from'} <strong>{e.who === e.user.login ? 'themselves' : e.who}</strong>
			{:else if e.milestone}{#if e.milestone.to && e.milestone.from}moved this from <strong>{e.milestone.from}</strong> to <strong>{e.milestone.to}</strong>{:else if e.milestone.to}added this to <strong>{e.milestone.to}</strong>{:else}removed this from <strong>{e.milestone.from}</strong>{/if}
			{:else if e.title}changed the title from <s>{e.title.from}</s> to <strong>{e.title.to}</strong>
			{:else if e.link}mentioned this in <a href={e.link.href}>{e.link.text}</a> <span class="ref-title">{e.link.title}</span>
			{:else if e.type === 'lock'}locked the conversation
			{:else if e.type === 'unlock'}unlocked the conversation
			{:else if e.type === 'draft'}marked this as a draft
			{:else if e.type === 'ready_for_review'}marked this ready for review
			{:else if e.type === 'change_target_branch'}changed the base from <code>{e.refs?.from}</code> to <code>{e.refs?.to}</code>
			{:else if e.type === 'delete_branch'}deleted the <code>{e.refs?.from}</code> branch
			{:else if e.type === 'merge_pull'}merged commit <a class="sha" href="/{repo}/commit/{e.commit}">{short(e.commit)}</a>
			{:else if e.type === 'pull_scheduled_merge'}set this to merge when checks pass
			{:else if e.type === 'pull_cancel_scheduled_merge'}cancelled auto-merge
			{:else if e.type === 'dismiss_review'}dismissed a review{#if e.text}: {e.text}{/if}
			{:else if e.push}
				{#if e.push.forced}force-pushed from <a class="sha" href="/{repo}/commit/{e.push.before}">{short(e.push.before)}</a> to <a class="sha" href="/{repo}/commit/{e.push.after}">{short(e.push.after)}</a>
				{:else}pushed {e.push.commits.length} commit{e.push.commits.length === 1 ? '' : 's'}
					{#each e.push.commits.slice(0, 5) as sha (sha)}<a class="sha" href="/{repo}/commit/{sha}">{short(sha)}</a>{/each}{#if e.push.commits.length > 5}…{/if}
				{/if}
			{/if}
			<span class="ago">{ago(e.date)}</span>
		</p>
	</li>
{/if}

<style>
	li {
		position: relative;
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		gap: 0.9rem;
		align-items: start;
		scroll-margin-top: 4rem;
	}
	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg);
		box-shadow: 0 0 0 4px var(--bg);
	}
	.card {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.comment:target .card {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
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
	.when {
		color: inherit;
	}
	.when:hover {
		color: var(--accent);
	}
	.more {
		position: relative;
		margin-left: auto;
	}
	.more summary {
		display: grid;
		place-items: center;
		padding: 0.1rem 0.3rem;
		border-radius: 6px;
		cursor: pointer;
		list-style: none;
	}
	.more summary::-webkit-details-marker {
		display: none;
	}
	.more summary:hover,
	.more[open] summary {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.panel {
		position: absolute;
		z-index: 20;
		right: 0;
		top: calc(100% + 0.25rem);
		min-width: 10rem;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
	}
	.panel button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.5rem;
		border: 0;
		background: none;
		text-align: left;
		font-size: 0.85rem;
	}
	.panel button:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.panel .danger {
		color: var(--del-fg);
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
		flex-wrap: wrap;
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
	.pad {
		margin: 0;
		padding: 0 1rem 0.75rem;
	}
	.event {
		align-items: center;
		font-size: 0.9rem;
		color: var(--muted);
	}
	:global(.event + .event) {
		margin-top: -0.6rem;
	}
	.event p {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.event strong {
		color: var(--fg);
	}
	.ref-title {
		color: var(--fg);
	}
	.sha,
	code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.sha {
		margin-right: 0.3rem;
	}
	.ago {
		white-space: nowrap;
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
	.dot.big {
		width: 32px;
		height: 32px;
		border: 0;
		color: var(--bg);
	}
	.dot.close {
		background: var(--del-fg);
	}
	.dot.reopen,
	.dot.merge_pull {
		background: var(--accent);
	}
	@media (max-width: 700px) {
		.who {
			flex-wrap: wrap;
			row-gap: 0.3rem;
		}
	}
</style>
