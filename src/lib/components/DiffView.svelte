<script lang="ts">
	import MentionPicker from './MentionPicker.svelte';
	import Byline from '#lib/components/Byline.svelte';
	import Icon from './Icon.svelte';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { toSplit, type Draft, type FileDiff, type Hunk, type Line } from '#lib/diff.js';
	import { ago } from '#lib/time.js';

	type LineComment = { id: number; review?: number; user: { login: string; avatar_url: string }; date: string; html: string; agent?: string };
	let {
		files,
		comments,
		commentError,
		pending = [],
		onpend,
		onunpend,
		viewedKey,
		source,
		resolved,
		agents
	}: {
		files: FileDiff[];
		comments?: Record<string, LineComment[]>;
		commentError?: string;
		pending?: Draft[];
		onpend?: (d: Draft) => void;
		onunpend?: (d: Draft) => void;
		viewedKey?: string;
		// Base URL of the lines endpoint at the diff's new-side ref, e.g. `/owner/repo/lines/<sha>`. Enables expanding context.
		source?: string;
		// Root comment ids of resolved threads. Enables the resolve controls.
		resolved?: number[];
		// Shows "Fix with agent" on open threads; the page needs an `agent` action.
		agents?: boolean;
	} = $props();

	let composer = $state<{ path: string; line: string } | null>(null);
	let draft = $state('');
	let sending = $state(false);

	// Context lines exist on both sides, so a comment on either side belongs to them.
	const keys = (l?: Line) =>
		!l ? [] : l.kind === 'del' ? [`old:${l.old}`] : l.kind === 'add' ? [`new:${l.new}`] : [`new:${l.new}`, `old:${l.old}`];
	const rowKeys = (lines: (Line | undefined)[]) => [...new Set(lines.flatMap(keys))];
	const threadFor = (path: string, lines: (Line | undefined)[]) => rowKeys(lines).flatMap((k) => comments?.[`${path}\0${k}`] ?? []);
	const pendingFor = (path: string, lines: (Line | undefined)[]) => {
		const k = rowKeys(lines);
		return pending.filter((d) => d.path === path && k.includes(d.line));
	};
	const composing = (path: string, lines: (Line | undefined)[]) =>
		composer?.path === path && lines.some((l) => l && keys(l)[0] === composer!.line);

	function open(path: string, l: Line) {
		composer = { path, line: keys(l)[0] };
		draft = '';
	}

	function pend() {
		if (!composer || !draft.trim()) return;
		onpend?.({ ...composer, body: draft.trim() });
		composer = null;
	}

	// Comments whose line isn't in the current diff (e.g. after a force-push) would otherwise vanish.
	function orphans(f: FileDiff) {
		if (!comments) return [];
		const shown = new Set(f.hunks.flatMap((h) => rowKeys(h.lines)).map((k) => `${f.to}\0${k}`));
		return Object.entries(comments)
			.filter(([k]) => k.startsWith(`${f.to}\0`) && !shown.has(k))
			.flatMap(([, c]) => c);
	}

	// Comments on files that a later push dropped from the diff entirely.
	const gone = $derived(Object.entries(comments ?? {}).filter(([k]) => !files.some((f) => k.startsWith(`${f.to}\0`))));

	let wantSplit = $state(false);
	let narrow = $state(false);
	const split = $derived(wantSplit && !narrow);
	let collapsed = $state<Record<number, boolean>>({});
	const additions = $derived(files.reduce((n, f) => n + f.additions, 0));
	const deletions = $derived(files.reduce((n, f) => n + f.deletions, 0));

	// Viewed files are remembered with a hash of their diff, so a file that changes again shows up unviewed.
	const sigs = $derived(
		files.map((f) => {
			const text = f.hunks.flatMap((h) => h.lines.map((l) => l.kind + l.text)).join('\n');
			let h = 0;
			for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
			return h.toString(36);
		})
	);
	let viewed = $state<Record<string, string>>({});
	const isViewed = (i: number) => viewed[files[i].to] === sigs[i];
	const viewedCount = $derived(files.filter((_, i) => isViewed(i)).length);

	function setViewed(i: number, on: boolean) {
		if (on) viewed[files[i].to] = sigs[i];
		else delete viewed[files[i].to];
		collapsed[i] = on;
		try {
			localStorage.setItem(viewedKey!, JSON.stringify(viewed));
		} catch {}
	}

	onMount(() => {
		try {
			wantSplit = localStorage.getItem('diff-view') === 'split';
			if (viewedKey) viewed = JSON.parse(localStorage.getItem(viewedKey) ?? '{}');
		} catch {}
		files.forEach((_, i) => isViewed(i) && (collapsed[i] = true));
		const m = matchMedia('(max-width: 700px)');
		narrow = m.matches;
		m.onchange = () => (narrow = m.matches);
	});

	function setSplit(value: boolean) {
		wantSplit = value;
		try {
			localStorage.setItem('diff-view', value ? 'split' : 'unified');
		} catch {}
	}

	const STEP = 50;
	const range = (h: Hunk) => {
		const m = h.header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/)!;
		return { old: +m[1], oldLen: m[2] === undefined ? 1 : +m[2], new: +m[3], len: m[4] === undefined ? 1 : +m[4] };
	};
	// Expanded lines, keyed "file:hunk": shown above that hunk, or below the last hunk when hunk === hunks.length.
	let extra = $state<Record<string, Line[]>>({});
	let eof = $state<Record<number, boolean>>({});
	const canExpand = (f: FileDiff) => !!source && f.status !== 'added' && f.status !== 'deleted' && f.hunks.length > 0;

	function hiddenAbove(f: FileDiff, fi: number, hi: number) {
		const prev = hi ? range(f.hunks[hi - 1]) : null;
		return range(f.hunks[hi]).new - (prev ? prev.new + prev.len : 1) - (extra[`${fi}:${hi}`]?.length ?? 0);
	}

	async function expand(f: FileDiff, fi: number, hi: number) {
		const key = `${fi}:${hi}`;
		const have = extra[key] ?? [];
		const below = hi === f.hunks.length;
		let from: number, to: number, delta: number;
		if (below) {
			const r = range(f.hunks[hi - 1]);
			from = r.new + r.len + have.length;
			to = from + STEP - 1;
			delta = r.old + r.oldLen - (r.new + r.len);
		} else {
			const r = range(f.hunks[hi]);
			to = r.new - 1 - have.length;
			from = Math.max(to - STEP + 1, to - hiddenAbove(f, fi, hi) + 1);
			delta = r.old - r.new;
		}
		const path = f.to.split('/').map(encodeURIComponent).join('/');
		const got: { text: string; html: string }[] = await (await fetch(`${source}/${path}?from=${from}&to=${to}`)).json();
		const lines = got.map((g, i): Line => ({ kind: 'ctx', old: from + i + delta, new: from + i, text: g.text, html: g.html }));
		extra[key] = below ? [...have, ...lines] : [...lines, ...have];
		if (below && got.length < STEP) eof[fi] = true;
	}

	const label = (f: FileDiff) => (f.status === 'renamed' ? `${f.from} → ${f.to}` : f.to);
	const sign = { add: '+', del: '-', ctx: ' ' };
	let mentionInput = $state<HTMLTextAreaElement>();
</script>

<div class="toolbar">
	<span>
		{files.length} file{files.length === 1 ? '' : 's'} changed
		<span class="add">+{additions}</span> <span class="del">−{deletions}</span>
		{#if viewedKey}<span class="muted">· {viewedCount} / {files.length} viewed</span>{/if}
	</span>
	<span class="toggle">
		<button class:on={!split} onclick={() => setSplit(false)}>Unified</button>
		<button class:on={split} onclick={() => setSplit(true)}>Split</button>
	</span>
</div>

<ul class="summary">
	{#each files as f, i (i)}
		<li>
			<span class="status {f.status}" title={f.status}>{f.status[0].toUpperCase()}</span>
			<a href="#file-{i}">{label(f)}</a>
			<span class="add">+{f.additions}</span> <span class="del">−{f.deletions}</span>
		</li>
	{/each}
</ul>

{#snippet plus(path: string, l: Line)}
	{#if comments}<button class="plus" aria-label="Comment on this line" onclick={() => open(path, l)}>+</button>{/if}
{/snippet}

{#snippet code(path: string, l: Line | undefined)}
	<td class="num">{l ? (l.kind === 'add' ? l.new : l.old) : ''}</td>
	<td class="code {l?.kind ?? 'empty'}">{#if l}{@render plus(path, l)}{@html l.html}{/if}</td>
{/snippet}

{#snippet expanded(fi: number, hi: number)}
	{#each extra[`${fi}:${hi}`] ?? [] as l (l.new)}
		<tr class="expanded">
			{#if split}
				<td class="num">{l.old}</td><td class="code ctx">{@html l.html}</td><td class="num">{l.new}</td><td class="code ctx">{@html l.html}</td>
			{:else}
				<td class="num">{l.old}</td><td class="num">{l.new}</td><td class="code ctx"><span class="sign"> </span>{@html l.html}</td>
			{/if}
		</tr>
	{/each}
{/snippet}

{#snippet commentCards(list: LineComment[])}
	{#each list as c (c.id)}
		<div class="comment">
			<div class="who"><img src={c.user.avatar_url} alt="" /><Byline bold login={c.user.login} agent={c.agent} /> {ago(c.date)}</div>
			<article class="markdown">{@html c.html}</article>
		</div>
	{/each}
{/snippet}

{#snippet thread(path: string, lines: (Line | undefined)[], cols: number)}
	{@const list = threadFor(path, lines)}
	{@const drafts = pendingFor(path, lines)}
	{#if list.length || drafts.length || composing(path, lines)}
		<tr class="thread">
			<td colspan={cols}>
				<div class="thread-box">
					{#if resolved && list.length}
						{@const done = resolved.includes(list[0].id)}
						<form class="resolve" method="POST" action="?/resolve" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="comment" value={list[0].id} />
							{#if done}<input type="hidden" name="undo" /><span class="tag">Resolved</span>{/if}
							{#if agents && !done}
								<input type="hidden" name="review" value={list[0].review} />
								<button formaction="?/agent">Fix with agent</button>
							{/if}
							<button>{done ? 'Unresolve' : 'Resolve'}</button>
						</form>
						{#if done}
							<details>
								<summary>{list.length} comment{list.length > 1 ? 's' : ''}</summary>
								{@render commentCards(list)}
							</details>
						{:else}
							{@render commentCards(list)}
						{/if}
					{:else}
						{@render commentCards(list)}
					{/if}
					{#each drafts as d (d)}
						<div class="comment pending">
							<div class="who">
								<span class="tag">Pending</span>
								<button class="remove" aria-label="Remove pending comment" onclick={() => onunpend?.(d)}>✕</button>
							</div>
							<p>{d.body}</p>
						</div>
					{/each}
					{#if composing(path, lines)}
						<form
							method="POST"
							action="?/comment"
							use:enhance={() => {
								sending = true;
								return async ({ result, update }) => {
									await update({ reset: false });
									sending = false;
									if (result.type === 'success') composer = null;
								};
							}}
						>
							<input type="hidden" name="path" value={path} />
							<input type="hidden" name="line" value={composer?.line} />
							<textarea
	bind:this={mentionInput}
								name="body"
								rows="3"
								bind:value={draft}
								{@attach (el) => el.focus()}
								placeholder="Comment on this line (Markdown supported)"
								onkeydown={(e) => {
									if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onpend ? pend() : e.currentTarget.form?.requestSubmit();
									if (e.key === 'Escape') composer = null;
								}}
							></textarea>
<MentionPicker input={mentionInput} />
							<div class="bar">
								{#if commentError}<span class="error">{commentError}</span>{/if}
								<button type="button" onclick={() => (composer = null)}>Cancel</button>
								{#if onpend}
									<button disabled={sending || !draft.trim()}>{sending ? 'Commenting…' : 'Comment now'}</button>
									<button type="button" class="primary" disabled={!draft.trim()} onclick={pend}>Add to review</button>
								{:else}
									<button class="primary" disabled={sending || !draft.trim()}>{sending ? 'Commenting…' : 'Comment'}</button>
								{/if}
							</div>
						</form>
					{:else}
						<button class="reply" onclick={() => open(path, lines.find(Boolean)!)}>Add a comment</button>
					{/if}
				</div>
			</td>
		</tr>
	{/if}
{/snippet}

{#each files as f, i (i)}
	<section class="file" id="file-{i}">
		<div class="file-head">
			<button onclick={() => (collapsed[i] = !collapsed[i])} aria-expanded={!collapsed[i]}>
				<span class="chev" class:shut={collapsed[i]}><Icon name="chevron" size={14} /></span>
				<span class="status {f.status}">{f.status}</span>
				<span class="path">{label(f)}</span>
				<span class="add">+{f.additions}</span> <span class="del">−{f.deletions}</span>
			</button>
			{#if viewedKey}
				<label class="viewed"><input type="checkbox" checked={isViewed(i)} onchange={(e) => setViewed(i, e.currentTarget.checked)} /> Viewed</label>
			{/if}
		</div>
		{#if !collapsed[i]}
			{#if f.binary}
				<p class="note">Binary file not shown</p>
			{:else if !f.hunks.length}
				<p class="note">{f.status === 'renamed' ? 'File renamed without changes' : 'No changes to show'}</p>
			{:else}
				<div class="scroll">
					<table class:split>
						{#if split}<colgroup><col class="n" /><col /><col class="n" /><col /></colgroup>{/if}
						{#each f.hunks as h, hi (hi)}
							{@const hidden = canExpand(f) ? hiddenAbove(f, i, hi) : 0}
							<tbody>
								{#if hidden > 0 || !canExpand(f) || (hi === 0 && !extra[`${i}:0`])}
									<tr class="hunk">
										<td colspan="4">
											{#if hidden > 0}<button class="expand" onclick={() => expand(f, i, hi)}>↑ {Math.min(hidden, STEP)} lines</button>{/if}
											{h.header}
										</td>
									</tr>
								{/if}
								{@render expanded(i, hi)}
								{#if split}
									{#each toSplit(h.lines) as row, ri (ri)}
										<tr>{@render code(f.to, row.left)}{@render code(f.to, row.right)}</tr>
										{@render thread(f.to, [row.left, row.right], 4)}
									{/each}
								{:else}
									{#each h.lines as l, li (li)}
										<tr>
											<td class="num">{l.old ?? ''}</td>
											<td class="num">{l.new ?? ''}</td>
											<td class="code {l.kind}">{@render plus(f.to, l)}<span class="sign">{sign[l.kind]}</span>{@html l.html}</td>
										</tr>
										{@render thread(f.to, [l], 3)}
									{/each}
								{/if}
							</tbody>
						{/each}
						{#if canExpand(f)}
							<tbody>
								{@render expanded(i, f.hunks.length)}
								{#if !eof[i]}
									<tr class="hunk"><td colspan="4"><button class="expand" onclick={() => expand(f, i, f.hunks.length)}>↓ Expand below</button></td></tr>
								{/if}
							</tbody>
						{/if}
					</table>
				</div>
			{/if}
			{@const outdated = orphans(f)}
			{#if outdated.length}
				<div class="outdated">
					<p class="muted">Comments on lines no longer in this diff</p>
					{@render commentCards(outdated)}
				</div>
			{/if}
		{/if}
	</section>
{/each}

{#if gone.length}
	<section class="file">
		<div class="outdated">
			<p class="muted">Comments on files no longer in this diff</p>
			{#each gone as [key, list] (key)}
				<p class="muted"><code>{key.split('\0')[0]}</code></p>
				{@render commentCards(list)}
			{/each}
		</div>
	</section>
{/if}

<style>
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.toggle {
		display: inline-flex;
	}
	.toggle button {
		border-radius: 0;
	}
	.toggle button:first-child {
		border-radius: 6px 0 0 6px;
	}
	.toggle button:last-child {
		border-radius: 0 6px 6px 0;
		border-left: 0;
	}
	.toggle button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}
	.add {
		color: var(--add-fg);
	}
	.del {
		color: var(--del-fg);
	}
	.summary {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0.4rem 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		font-family: var(--mono);
		font-size: 0.85rem;
	}
	.summary li {
		align-items: center;
		padding: 0.25rem 1rem !important;
	}
	.summary li:hover {
		background: var(--surface);
	}
	.summary li {
		display: flex;
		gap: 0.5rem;
		padding: 0.15rem 0;
	}
	.summary a {
		color: var(--fg);
		margin-right: auto;
	}
	.status {
		padding: 0.05rem 0.45rem;
		border-radius: 4px;
		font-size: 0.72rem;
		font-family: system-ui, sans-serif;
		font-weight: 600;
		color: var(--warn);
		background: color-mix(in srgb, currentColor 14%, transparent);
	}
	.summary .status {
		display: inline-grid;
		place-items: center;
		width: 1.15rem;
		height: 1.15rem;
		padding: 0;
	}
	.status.added {
		color: var(--add-fg);
	}
	.status.deleted {
		color: var(--del-fg);
	}
	.status.renamed {
		color: var(--accent);
	}
	.file {
		border: 1px solid var(--border);
		border-radius: 8px;
		margin-bottom: 1rem;
		overflow: clip;
		scroll-margin-top: 1rem;
	}
	/* Sticky so a long diff keeps its file name in view; overflow: clip (not hidden) on .file is what allows it. */
	.file-head {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--border);
		border-radius: 8px 8px 0 0;
		background: var(--surface);
		font-size: 0.85rem;
	}
	.file-head button {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border: 0;
		border-radius: 0;
		padding: 0.5rem 1rem;
		background: none;
		text-align: left;
		font-size: inherit;
	}
	.viewed {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 1rem;
		color: var(--muted);
		cursor: pointer;
	}
	.file-head .path {
		font-family: var(--mono);
		margin-right: auto;
	}
	.chev {
		display: flex;
		color: var(--muted);
		transition: transform 0.12s;
	}
	.chev.shut {
		transform: rotate(-90deg);
	}
	.note {
		margin: 0;
		padding: 1rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.scroll {
		overflow-x: auto;
		border-top: 1px solid var(--border);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--mono);
		font-size: 0.8rem;
		line-height: 1.5;
	}
	table.split {
		table-layout: fixed;
	}
	col.n {
		width: 3.5rem;
	}
	td {
		padding: 0 0.6rem;
		vertical-align: top;
	}
	td.num {
		width: 1%;
		min-width: 2.5rem;
		text-align: right;
		color: var(--muted);
		user-select: none;
		white-space: nowrap;
	}
	td.code {
		white-space: pre;
	}
	table.split td.code {
		white-space: pre-wrap;
		word-break: break-all;
	}
	td.add {
		background: var(--add-bg);
	}
	td.del {
		background: var(--del-bg);
	}
	td.empty {
		background: var(--surface);
	}
	.sign {
		display: inline-block;
		width: 1.5ch;
		color: var(--muted);
		user-select: none;
	}
	td.code {
		position: relative;
	}
	.plus {
		position: absolute;
		left: -0.55rem;
		top: 0;
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
		line-height: 1;
		font-size: 0.8rem;
		border-radius: 4px;
		border: 0;
		background: var(--accent);
		color: var(--bg);
		opacity: 0;
		z-index: 1;
	}
	tr:hover .plus,
	.plus:focus-visible {
		opacity: 1;
	}
	tr.thread > td {
		padding: 0;
		font-family: system-ui, sans-serif;
		font-size: 0.9rem;
		white-space: normal;
	}
	.thread-box {
		margin: 0.5rem 1rem;
		max-width: 760px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		overflow: hidden;
	}
	.comment + .comment,
	.thread-box > form,
	.thread-box > .reply {
		border-top: 1px solid var(--border);
	}
	.comment .who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem 0;
		color: var(--muted);
		font-size: 0.8rem;
	}
	.comment .who :global(strong) {
		color: var(--fg);
	}
	.comment img {
		width: 18px;
		height: 18px;
		border-radius: 50%;
	}
	.pending .who {
		justify-content: space-between;
	}
	.pending .tag {
		margin: 0;
		color: var(--accent);
		border-color: var(--accent);
	}
	.pending p {
		margin: 0;
		padding: 0.35rem 0.75rem 0.6rem;
		white-space: pre-wrap;
	}
	.remove {
		padding: 0 0.3rem;
		border: 0;
		background: none;
		color: var(--muted);
	}
	.resolve {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.75rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.resolve .tag {
		margin: 0 auto 0 0;
	}
	.resolve button {
		padding: 0 0.5rem;
		font-size: 0.75rem;
		background: var(--bg);
	}
	details summary {
		padding: 0.4rem 0.75rem;
		color: var(--muted);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.comment .markdown {
		padding: 0.35rem 0.75rem 0.6rem;
	}
	.thread-box textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		padding: 0.6rem 0.75rem;
		font: inherit;
		background: var(--bg);
		color: var(--fg);
		resize: vertical;
	}
	.thread-box textarea:focus {
		outline: none;
	}
	.bar {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.75rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.bar .error {
		margin-right: auto;
		color: var(--del-fg);
	}
	.reply {
		display: block;
		width: 100%;
		text-align: left;
		border: 0;
		border-radius: 0;
		color: var(--muted);
		background: var(--surface);
	}
	.outdated {
		border-top: 1px solid var(--border);
		padding: 0.5rem 1rem 1rem;
		font-size: 0.9rem;
	}
	.outdated p {
		margin: 0.25rem 0 0.5rem;
		font-size: 0.8rem;
	}
	.outdated .comment {
		border: 1px solid var(--border);
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}
	.expand {
		margin-right: 0.6rem;
		padding: 0 0.5rem;
		font-family: system-ui, sans-serif;
		font-size: 0.75rem;
		border-color: var(--border);
		background: var(--bg);
		color: var(--accent);
	}
	tr.hunk td {
		padding: 0.25rem 0.6rem;
		background: var(--hunk-bg);
		color: var(--muted);
	}
	td.code :global(span) {
		color: var(--shiki-light);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) td.code :global(span) {
			color: var(--shiki-dark);
		}
	}
	:global(:root[data-theme='dark']) td.code :global(span) {
		color: var(--shiki-dark);
	}
	@media (max-width: 700px) {
		.toggle {
			display: none;
		}
		td {
			padding: 0 0.35rem;
		}
		td.num {
			min-width: 1.75rem;
		}
		.file-head button {
			min-width: 0;
			padding-inline: 0.75rem;
		}
		.file-head .path {
			min-width: 0;
			overflow-wrap: anywhere;
		}
		.viewed {
			padding: 0 0.75rem 0 0;
		}
		.thread-box {
			position: sticky;
			left: 0.5rem;
			margin: 0.5rem;
			max-width: calc(100vw - 3rem - 2px);
		}
	}
	@media (hover: none) {
		.plus {
			opacity: 0.6;
			width: 1.4rem;
			height: 1.4rem;
		}
	}
</style>
