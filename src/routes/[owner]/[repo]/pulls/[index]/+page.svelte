<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	let busy = $state(false);
	let style = $derived(data.repo.default_merge_style);
	let approveBtn = $state<HTMLButtonElement>();
	let mergeBtn = $state<HTMLButtonElement>();
	let armed = $state<ReturnType<typeof setTimeout>>();
	const own = $derived(data.pull.user.id === data.user?.id);
	const rows = $derived([
		...(data.checks.total
			? [{ text: `${data.checks.passed} of ${data.checks.total} checks passed`, state: data.checks.state === 'success' ? 'done' : ['failure', 'error'].includes(data.checks.state) ? 'fail' : 'todo' }]
			: []),
		data.pull.mergeable ? { text: `No conflicts with ${data.pull.base.ref}`, state: 'done' } : { text: `Conflicts with ${data.pull.base.ref}`, state: 'fail' },
		...(data.openThreads ? [{ text: `${data.openThreads} open thread${data.openThreads > 1 ? 's' : ''}`, state: 'todo' }] : []),
		...(own ? [] : [{ text: 'Your approval', state: data.approved ? 'done' : 'todo' }])
	]);
	const blocked = $derived(rows.some((r) => r.state === 'fail'));
	const pending = $derived(data.checks.total > 0 && data.checks.state === 'pending');
	let commenting = $state(false);
	let draft = $state('');
	const reviewLabel: Record<string, string> = {
		APPROVED: 'approved these changes',
		REQUEST_CHANGES: 'requested changes',
		COMMENT: 'reviewed'
	};
</script>

<ol class="timeline">
	<li>
		<img class="avatar" src={data.pull.user.avatar_url} alt="" />
		<div class="card">
		<div class="who"><strong>{data.pull.user.login}</strong>{#if data.bodyAgent}<span class="agent" title="Opened by an agent through forge">{data.bodyAgent}</span>{/if} opened this {ago(data.pull.created_at)}</div>
		{#if data.body}<article class="markdown">{@html data.body}</article>{:else}<p class="muted empty">No description provided.</p>{/if}
		</div>
	</li>
	{#each data.timeline as item (item.id)}
		<li>
			<img class="avatar" src={item.user.avatar_url} alt="" />
			<div class="card">
			<div class="who">
				<strong>{item.user.login}</strong>{#if item.agent}<span class="agent" title="Written by an agent through forge">{item.agent}</span>{/if}
				{item.state ? (reviewLabel[item.state] ?? 'reviewed') : 'commented'} {ago(item.date)}
			</div>
			{#if item.html}<article class="markdown">{@html item.html}</article>{/if}
			{#each item.inline as c (c.id)}
				<div class="inline">
					<div class="loc">
						<a href="/{data.repo.full_name}/pulls/{data.pull.number}/files">{c.path}:{c.line}</a>
						{#if c.outdated}<span class="tag">Outdated</span>{/if}
						{#if c.resolved}<span class="tag">Resolved</span>{/if}
						{#if data.agents && c.root && !c.outdated && !c.resolved}
							<form class="fix" method="POST" action="?/agent" use:enhance>
								<input type="hidden" name="comment" value={c.id} />
								<input type="hidden" name="review" value={c.review} />
								<button>Fix with agent</button>
							</form>
						{/if}
						{#if c.root && !c.outdated}
							<form method="POST" action="?/resolve" use:enhance={() => async ({ update }) => update({ reset: false })}>
								<input type="hidden" name="comment" value={c.id} />
								{#if c.resolved}<input type="hidden" name="undo" />{/if}
								<button>{c.resolved ? 'Unresolve' : 'Resolve'}</button>
							</form>
						{/if}
					</div>
					<pre class="context">{c.context.join('\n')}</pre>
					{#if c.agent}<div class="muted by"><span class="agent">{c.agent}</span></div>{/if}
					<article class="markdown">{@html c.html}</article>
				</div>
			{/each}
			</div>
		</li>
	{/each}
	{#if data.pull.state === 'closed'}
		<li class="event">
			<span class="dot" class:merged={data.pull.merged}><Icon name={data.pull.merged ? 'merge' : 'x'} size={16} /></span>
			{#if data.pull.merged}
				<p><strong>{data.pull.merged_by?.login}</strong> merged into <code>{data.pull.base.ref}</code> {ago(data.pull.merged_at!)}</p>
			{:else}
				<p><strong>Closed</strong> without merging {ago(data.pull.closed_at!)}</p>
			{/if}
		</li>
	{/if}
</ol>

{#if data.pull.state !== 'closed'}
<section class="merge">
	{#if !data.repo.permissions.push}
		<p class="muted">You don't have permission to merge this pull request.</p>
	{:else}
		<div class="checks">
			<h3>{data.autoMerge ? 'Auto-merge is on' : blocked ? "Can't merge yet" : rows.every((r) => r.state === 'done') ? 'Ready to merge' : 'Almost there'}</h3>
			<ul>
				{#each rows as r (r.text)}
					<li class={r.state}><span class="mark">{r.state === 'done' ? '✓' : r.state === 'fail' ? '✕' : '·'}</span>{r.text}</li>
				{/each}
			</ul>
		</div>
		<form
			class="bar"
			method="POST"
			action="?/merge"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			{#if data.autoMerge}
			<span class="muted scheduled">{data.autoMerge} set this to merge when checks pass</span>
			{#if form?.error && form.action === 'merge'}<span class="error">{form.error}</span>{/if}
			<button formaction="?/cancelAutoMerge" disabled={busy}>Cancel auto-merge</button>
			{:else}
			<select name="style" bind:value={style} aria-label="Merge style">
				{#each data.mergeStyles as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
			</select>
			<label><input type="checkbox" name="delete_branch" checked={data.repo.default_delete_branch_after_merge} /> Delete branch</label>
			{#if form?.error && (form.action === 'merge' || form.action === 'approve')}<span class="error">{form.error}</span>{/if}
			{#if !own}
				<button formaction="?/approve" bind:this={approveBtn} disabled={busy || data.approved}>{data.approved ? 'Approved' : 'Approve'} <kbd>A</kbd></button>
			{/if}
			<button class="primary" bind:this={mergeBtn} disabled={busy || blocked}>
				{#if armed}Press M again to merge{:else if pending}Merge when checks pass <kbd>M</kbd>{:else}{data.mergeStyles.find((s) => s.value === style)?.label} <kbd>M</kbd>{/if}
			</button>
			{#if pending}<input type="hidden" name="when_checks_pass" />{/if}
			{/if}
		</form>
	{/if}
</section>
{/if}

<form
	class="compose"
	method="POST"
	action="?/comment"
	use:enhance={() => {
		commenting = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') draft = '';
			commenting = false;
		};
	}}
>
	<textarea
		name="body"
		bind:value={draft}
		placeholder="Leave a comment (Markdown supported)"
		rows="4"
		onkeydown={(e) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
		}}
	></textarea>
	<div class="compose-bar">
		{#if form?.error && form.action === 'comment'}<span class="error">{form.error}</span>{/if}
		<span class="muted hint">Ctrl+Enter to send</span>
		<button class="primary" disabled={commenting || !draft.trim()}>{commenting ? 'Commenting…' : 'Comment'}</button>
	</div>
</form>


<svelte:window
	onkeydown={(e) => {
		if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'a' && approveBtn && !approveBtn.disabled) approveBtn.click();
		if (e.key !== 'm' || !mergeBtn || mergeBtn.disabled) return;
		// Merging can't be undone, so one stray keypress only arms the button.
		if (armed) mergeBtn.click();
		else armed = setTimeout(() => (armed = undefined), 2000);
	}}
/>

<style>
	.by {
		padding: 0.5rem 0.75rem 0;
	}
	.by .agent {
		margin-left: 0;
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
	.event p {
		margin: 0;
	}
	.event strong {
		color: var(--fg);
	}
	.dot {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--del-fg);
		color: var(--bg);
		box-shadow: 0 0 0 4px var(--bg);
	}
	.dot.merged {
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
	.who strong {
		color: var(--fg);
	}
	img {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}
	.merge {
		margin-top: 1.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.merge p {
		margin: 0;
		padding: 1rem;
	}
	.checks {
		padding: 1rem;
	}
	h3 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
	}
	.merge ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}
	.merge li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border: 0;
		border-radius: 0;
		font-size: 0.9rem;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: 50%;
		font-size: 0.7rem;
		font-weight: 700;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.done .mark {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}
	.fail .mark {
		background: var(--del-fg);
		border-color: var(--del-fg);
		color: var(--bg);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.bar label,
	.scheduled {
		margin-right: auto;
	}
	kbd {
		margin-left: 0.3rem;
		font-family: var(--mono);
		font-size: 0.75em;
		opacity: 0.6;
	}
	select {
		font: inherit;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--fg);
	}
	label {
		font-size: 0.9rem;
		color: var(--muted);
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.inline {
		margin: 0 1rem 1rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}
	.loc {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.35rem 0.75rem;
		font-family: var(--mono);
		font-size: 0.8rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.loc form:first-of-type {
		margin-left: auto;
	}
	.loc button {
		padding: 0 0.5rem;
		font-family: system-ui, sans-serif;
		font-size: 0.75rem;
		background: var(--bg);
	}
	.context {
		margin: 0;
		padding: 0.5rem 0.75rem;
		font-family: var(--mono);
		font-size: 0.8rem;
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
		color: var(--muted);
	}
	.inline .markdown {
		padding: 0.6rem 0.75rem;
	}
	.compose {
		margin-top: 1.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
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
	.compose:focus-within {
		border-color: var(--accent);
	}
	.compose-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.compose-bar button {
		margin-left: auto;
	}
	.hint {
		font-size: 0.8rem;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
	.markdown,
	.empty {
		padding: 1rem;
		margin: 0;
	}
</style>
