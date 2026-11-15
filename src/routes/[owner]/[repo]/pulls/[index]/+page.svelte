<script lang="ts">
	import MentionPicker from '#lib/components/MentionPicker.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import Byline from '#lib/components/Byline.svelte';
	import Description from '#lib/components/Description.svelte';
	import Triage from '#lib/components/Triage.svelte';
	import SidePicker from '#lib/components/SidePicker.svelte';
	import ThreadItem from '#lib/components/ThreadItem.svelte';
	import ThreadSide from '#lib/components/ThreadSide.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	let busy = $state(false);
	let style = $derived(data.repo.default_merge_style);
	let approveBtn = $state<HTMLButtonElement>();
	let mergeBtn = $state<HTMLButtonElement>();
	let armed = $state<ReturnType<typeof setTimeout>>();
	const own = $derived(data.pull.user.id === data.user?.id);
	const rows = $derived([
		...(data.checks.list.length
			? [{ text: `${data.checks.list.filter((c) => c.state === 'success').length} of ${data.checks.list.length} checks passed`, state: mark(data.checks.state), checks: true }]
			: []),
		data.pull.mergeable ? { text: `No conflicts with ${data.pull.base.ref}`, state: 'done' } : { text: `Conflicts with ${data.pull.base.ref}`, state: 'fail' },
		...(data.behind ? [{ text: `${data.behind} commit${data.behind === 1 ? '' : 's'} behind ${data.pull.base.ref}`, state: 'todo', update: true }] : []),
		...(data.openThreads ? [{ text: `${data.openThreads} open thread${data.openThreads > 1 ? 's' : ''}`, state: 'todo' }] : []),
		...(own ? [] : [{ text: 'Your approval', state: data.approved ? 'done' : 'todo' }])
	]);
	const blocked = $derived(rows.some((r) => r.state === 'fail'));
	// Forgejo only refuses a merge on failed checks when branch protection requires them, so failed checks alone can be overridden.
	const override = $derived(blocked && data.pull.mergeable && data.checks.state !== 'pending');
	const failedRuns = $derived([...new Set(data.checks.list.filter((c) => mark(c.state) === 'fail' && c.run).map((c) => c.run))]);
	const pending = $derived(data.checks.list.length > 0 && data.checks.state === 'pending');

	$effect(() => {
		if (!pending) return;
		const timer = setInterval(invalidateAll, 5000);
		return () => clearInterval(timer);
	});
	function mark(state: string) {
		return state === 'success' ? 'done' : ['failure', 'error'].includes(state) ? 'fail' : 'todo';
	}
	let commenting = $state(false);
	let draft = $state('');
	const reviewLabel: Record<string, string> = {
		APPROVED: 'approved these changes',
		REQUEST_CHANGES: 'requested changes',
		COMMENT: 'reviewed'
	};
	let mentionInput = $state<HTMLTextAreaElement>();
	const canEdit = $derived(data.repo.permissions.push || own);
	const locked = $derived(!!data.pull.is_locked && !data.repo.permissions.push);
	const requested = $derived(new Set(data.reviewers.filter((r) => r.state === 'REQUESTED').map((r) => r.login)));
	const REVIEW: Record<string, [string, string]> = { REQUESTED: ['clock', 'Review requested'], APPROVED: ['check', 'Approved'], REQUEST_CHANGES: ['x', 'Requested changes'], COMMENT: ['message', 'Commented'] };
	let updateStyle = $state('merge');
	function quote(text: string) {
		draft = (draft.trim() ? `${draft.trimEnd()}\n\n` : '') + text;
		mentionInput?.focus();
		mentionInput?.scrollIntoView({ block: 'center' });
	}
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<div class="layout">
<div>
<ol class="timeline">
	<li>
		<img class="avatar" src={data.pull.user.avatar_url} alt="" />
		<Description login={data.pull.user.login} agent={data.agent} agentHref={data.agentHref} created={data.pull.created_at} html={data.body} body={data.pull.body} can={data.repo.permissions.push || own} reactions={data.reactions} signedIn={!!data.user} onquote={quote} />
	</li>
	{#each data.timeline as item (`${item.type}-${item.id}`)}
		{#if !('inline' in item)}
			<ThreadItem {item} repo={data.repo.full_name} me={data.user?.login} admin={data.repo.permissions.admin} onquote={quote} />
		{:else}
		<li id="pullrequestreview-{item.id}">
			<img class="avatar" src={item.user.avatar_url} alt="" />
			<div class="card">
			<div class="who">
				<Byline bold login={item.user.login} agent={item.agent} />
				{reviewLabel[item.state] ?? 'reviewed'} {ago(item.date)}
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
					{#if c.agent}<div class="muted by"><Byline login={item.user.login} agent={c.agent} /></div>{/if}
					<article class="markdown">{@html c.html}</article>
				</div>
			{/each}
			</div>
		</li>
	{/if}
	{/each}
	{#if data.pull.state === 'closed' && !data.timeline.some((e) => e.type === 'merge_pull' || e.type === 'close')}
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
	{#if data.pull.draft}
		<div class="draft-note">
			<p><strong>This pull request is still a draft.</strong> Mark it ready for review to merge it.</p>
			{#if canEdit}
				<form method="POST" action="?/draft" use:enhance={keep}>
					<input type="hidden" name="ready" />
					<button class="primary">Ready for review</button>
				</form>
			{/if}
			{#if form?.action === 'draft'}<span class="error">{form.error}</span>{/if}
		</div>
	{:else if !data.repo.permissions.push}
		<p class="muted">You don't have permission to merge this pull request.</p>
	{:else}
		<div class="checks">
			<div class="checks-head">
				<h3>{data.autoMerge ? 'Auto-merge is on' : blocked ? (override ? 'Checks failed' : "Can't merge yet") : rows.every((r) => r.state === 'done') ? 'Ready to merge' : 'Almost there'}</h3>
				{#if failedRuns.length}
					<form method="POST" action="?/rerun" use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							await update();
							busy = false;
						};
					}}>
						{#each failedRuns as run (run)}<input type="hidden" name="run" value={run} />{/each}
						{#if form?.error && form.action === 'rerun'}<span class="error">{form.error}</span>{/if}
						<button disabled={busy}>Re-run failed checks</button>
					</form>
				{/if}
			</div>
			<ul>
				{#each rows as r (r.text)}
					<li class={r.state}>
						<span class="mark">{r.state === 'done' ? '✓' : r.state === 'fail' ? '✕' : '·'}</span>{r.text}
						{#if 'update' in r}
							<form class="update" method="POST" action="?/update" use:enhance={() => {
								busy = true;
								return async ({ update }) => {
									await update({ reset: false });
									busy = false;
								};
							}}>
								{#if form?.action === 'update'}<span class="error">{form.error}</span>{/if}
								<select name="style" bind:value={updateStyle} aria-label="How to update">
									<option value="merge">Merge {data.pull.base.ref} in</option>
									<option value="rebase">Rebase onto {data.pull.base.ref}</option>
								</select>
								<button disabled={busy}>Update branch</button>
							</form>
						{/if}
					</li>
					{#if 'checks' in r}
						<li class="sub"><ul class="jobs">
							{#each data.checks.list as c (c.name)}
								<li class={mark(c.state)}>
									<span class="mark">{c.state === 'success' ? '✓' : mark(c.state) === 'fail' ? '✕' : '·'}</span>{c.name}<span class="muted">{c.description}</span>
									{#if c.url}<a href={c.url} target="_blank" rel="noreferrer">Logs</a>{/if}
								</li>
							{/each}
						</ul></li>
					{/if}
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
			<button
				class={override ? 'danger' : 'primary'}
				bind:this={mergeBtn}
				disabled={busy || (blocked && !override)}
				onclick={(e) => {
					// Overriding failed checks takes a second click, like the M key always does.
					if (!override || armed) return;
					e.preventDefault();
					armed = setTimeout(() => (armed = undefined), 3000);
				}}
			>
				{#if armed}{override ? 'Click again to confirm' : 'Press M again to merge'}{:else if override}Merge anyway <kbd>M</kbd>{:else if pending}Merge when checks pass <kbd>M</kbd>{:else}{data.mergeStyles.find((s) => s.value === style)?.label} <kbd>M</kbd>{/if}
			</button>
			{#if pending}<input type="hidden" name="when_checks_pass" />{/if}
			{/if}
		</form>
	{/if}
</section>
{/if}

{#if locked}
	<p class="locked muted"><Icon name="lock" size={14} />This conversation is locked; only people with write access can comment.</p>
{:else if data.user}
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
		{#if canEdit && !data.pull.merged}
			{@const close = data.pull.state === 'open'}
			<input type="hidden" name="to" value={close ? 'closed' : 'open'} />
			<button class="state" formaction="?/state" disabled={commenting}>
				<Icon name={close ? 'x' : 'changes'} size={14} />{close ? (draft.trim() ? 'Close with comment' : 'Close pull request') : draft.trim() ? 'Reopen with comment' : 'Reopen'}
			</button>
		{/if}
		<button class="primary" disabled={commenting || !draft.trim()}>{commenting ? 'Commenting…' : 'Comment'}</button>
	</div>
</form>
{/if}
</div>

<aside>
	<div class="side">
		<SidePicker
			title="Reviewers"
			icon="eye"
			action="reviewers"
			can={canEdit && data.pull.state === 'open'}
			options={data.reviewerOptions}
			on={(u) => requested.has(u.login)}
			fields={(u) => [['login', u.login], ...(requested.has(u.login) ? [['remove', ''] as [string, string]] : [])]}
			empty="No reviews yet"
			shown={data.reviewers.length ? reviewerList : undefined}
		>
			{#snippet row(u)}
				<img class="mini" src={u.avatar_url} alt="" />{u.login}
			{/snippet}
		</SidePicker>
		<Triage item={data.pull} options={data.options} can={data.repo.permissions.push} list="/{data.repo.full_name}/pulls" />
		{#if data.pull.state === 'open' && data.repo.permissions.push}
			<section>
				<h3 class="side-title">Base branch</h3>
				<form class="base" method="POST" action="?/base" use:enhance={keep}>
					<select name="base" value={data.pull.base.ref} aria-label="Base branch" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
						{#each data.branches as b (b)}<option value={b}>{b}</option>{/each}
					</select>
				</form>
				{#if form?.action === 'base'}<p class="error">{form.error}</p>{/if}
			</section>
		{/if}
		{#if data.pull.state === 'open' && canEdit && !data.pull.draft}
			<form method="POST" action="?/draft" use:enhance={keep}><button class="ghost"><Icon name="pencil" size={14} />Convert to draft</button></form>
		{/if}
	</div>
	<ThreadSide subscribed={data.subscribed} locked={!!data.pull.is_locked} pinned={!!data.pull.pin_order} signedIn={!!data.user} can={data.repo.permissions.push} />
</aside>

{#snippet reviewerList()}
	<ul class="reviewers">
		{#each data.reviewers as r (r.login)}
			<li title={REVIEW[r.state]?.[1]}>
				<img class="mini" src={r.avatar_url} alt="" />{r.login}
				<span class="rstate {r.state}" class:stale={r.stale}><Icon name={REVIEW[r.state]?.[0] ?? 'message'} size={14} /></span>
			</li>
		{/each}
	</ul>
{/snippet}

</div>

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
	.by {
		padding: 0.5rem 0.75rem 0;
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
		border-radius: var(--radius);
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
	img {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}
	.merge {
		margin-top: 1.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
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
	.checks-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}
	.checks-head form {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}
	.checks-head button {
		font-size: 0.85rem;
		padding: 0.2rem 0.6rem;
	}
	button.danger {
		color: var(--del-fg);
		border-color: var(--del-fg);
		font-weight: 600;
		background: none;
	}
	button.danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--del-fg) 12%, transparent);
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
	.merge .sub {
		display: block;
	}
	.merge .jobs {
		margin-left: 1.8rem;
	}
	.jobs li {
		font-size: 0.85rem;
	}
	.jobs a {
		margin-left: auto;
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
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.bar label,
	.scheduled {
		margin-right: auto;
	}
	.bar label,
	.bar button {
		white-space: nowrap;
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
		border-radius: var(--radius);
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
	.hint {
		margin-right: auto;
		font-size: 0.8rem;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
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
	.state {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.draft-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
	}
	.draft-note p {
		flex: 1;
		min-width: 12rem;
		padding: 0;
	}
	.update {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}
	.update select {
		min-width: 0;
		font-size: 0.85rem;
		padding: 0.2rem 0.4rem;
	}
	.update button {
		font-size: 0.85rem;
		padding: 0.2rem 0.6rem;
	}
	.side {
		display: grid;
		gap: 1.25rem;
	}
	.side-title {
		margin: 0 0 0.6rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.base select {
		width: 100%;
		min-width: 0;
		font-size: 0.85rem;
		padding: 0.25rem 0.4rem;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0;
		border-color: transparent;
		background: none;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.ghost:hover {
		color: var(--accent);
	}
	.reviewers {
		display: grid;
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.reviewers li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	img.mini {
		width: 20px;
		height: 20px;
	}
	.rstate {
		margin-left: auto;
		color: var(--muted);
	}
	.rstate.APPROVED {
		color: var(--accent);
	}
	.rstate.REQUEST_CHANGES {
		color: var(--del-fg);
	}
	.rstate.stale {
		opacity: 0.5;
	}
	.markdown {
		padding: 1rem;
		margin: 0;
	}
	@media (max-width: 700px) {
		.who,
		.bar,
		.checks-head,
		.compose-bar {
			flex-wrap: wrap;
			row-gap: 0.4rem;
		}
		.hint {
			display: none;
		}
	}
</style>
