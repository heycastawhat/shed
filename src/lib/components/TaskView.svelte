<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { kind, rel, status } from '#lib/agent-status.js';
	import Icon from '#lib/components/Icon.svelte';
	import type { AgentThread, ModelChoice, Question, TurnItem } from '#lib/server/t3.js';
	import { ago } from '#lib/time.js';

	type Thread = AgentThread & { host: string; hostName: string; web: string };
	type Item = TurnItem & { html: string };
	type Request = { id: string; kind: string; questions: Question[] | null };
	let {
		thread: sel,
		items,
		pending,
		models,
		form,
		repo = null,
		poll = true
	}: {
		thread: Thread;
		items: Item[];
		pending: Request[];
		models: ModelChoice[];
		form: Record<string, unknown> | null | undefined;
		repo?: string | null;
		poll?: boolean;
	} = $props();
	const data = $derived({ selected: { items, pending } });
	const s = $derived(status(sel));
	const modelName = (slug: string) => models.find((m) => m.slug === slug)?.name ?? slug;
	const agentName = $derived(models.find((m) => m.instanceId === sel.modelSelection.instanceId)?.provider ?? 'Agent');

	// T3 has a live event stream, but polling the projection while something runs keeps forge stateless.
	$effect(() => {
		if (!poll || !(sel.activeRunId || sel.pendingRuntimeRequest)) return;
		const timer = setInterval(invalidateAll, 2000);
		return () => clearInterval(timer);
	});

	const when = (d: string | null) => (d ? new Date(d).toLocaleString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', day: 'numeric', month: 'short' }) : '');

	// Messages stand alone; everything the agent does between them folds into one expandable line.
	type Block = { kind: 'user'; it: Item } | { kind: 'question'; it: Item } | { kind: 'agent'; it: Item } | { kind: 'steps'; items: Item[] };
	const blocks = $derived.by(() => {
		const out: Block[] = [];
		for (const it of items) {
			if (it.type === 'user_message') out.push({ kind: 'user', it });
			else if (it.type === 'user_input_request') out.push({ kind: 'question', it });
			else if (it.type === 'assistant_message') out.push({ kind: 'agent', it });
			else if (it.type !== 'checkpoint' || it.files?.length) {
				const last = out.at(-1);
				if (last?.kind === 'steps') last.items.push(it);
				else out.push({ kind: 'steps', items: [it] });
			}
		}
		return out;
	});
	function stepText(it: Item) {
		if (it.type === 'command_execution') return it.input === 'Preparing workspace' ? (it.title ?? 'Preparing workspace') : `Running ${it.input}`;
		if (it.type === 'reasoning') return 'Thinking…';
		if (it.type === 'file_change') return `Edited ${rel(it.fileName)}`;
		if (it.type === 'approval_request') return `Asked to ${kind(it.requestKind ?? '')}: ${rel(it.prompt)}`;
		return rel(it.title) || it.type.replaceAll('_', ' ');
	}
	function summary(items: Item[]) {
		const n = (type: string) => items.filter((i) => i.type === type && i.input !== 'Preparing workspace').length;
		const files = items.filter((i) => i.type === 'checkpoint').reduce((t, i) => t + (i.files?.length ?? 0), 0);
		const parts = [
			[n('command_execution'), 'ran {} command', 's'],
			[n('file_change'), 'edited {} file', 's'],
			[files, 'changed {} file', 's'],
			[n('reasoning'), 'thought {} time', 's']
		]
			.filter(([c]) => c)
			.map(([c, t, pl]) => String(t).replace('{}', String(c)) + (c === 1 ? '' : pl));
		const text = parts.join(', ') || stepText(items[0]);
		return text[0].toUpperCase() + text.slice(1);
	}
</script>


<section class="detail">
	<header>
		<h2>{sel.title}</h2>
	<a class="web" href={sel.web} target="_blank" rel="noopener">Open in T3 Code <Icon name="external" size={14} /></a>
		{#if sel.activeRunId}
			<form method="POST" action="?/stop" use:enhance>
				<input type="hidden" name="thread" value={sel.id} /><input type="hidden" name="host" value={sel.host} />
				<input type="hidden" name="run" value={sel.activeRunId} />
				<button class="stop">Stop</button>
			</form>
		{/if}
	</header>
	<p class="meta">
		<span class="state {s.kind}">{s.label}</span>
		<span>{modelName(sel.modelSelection.model)}</span>
		<span>on {sel.hostName}</span>
		{#if sel.branch}<code>{sel.branch}</code>{/if}
		<span>{ago(sel.createdAt)}</span>
	</p>


	<div class="log">
		{#each blocks as b, bi (bi)}
			{#if b.kind === 'user'}
				<div class="you" title={when(b.it.startedAt)}><p>{b.it.text}</p></div>
			{:else if b.kind === 'question'}
				{#if !data.selected.pending.some((r) => r.id === b.it.requestId)}<div class="asked">
					<span class="who">{agentName} asked</span>
					{#each b.it.questions ?? [] as q (q.id)}<p>{q.question}</p>{/each}
					{#if b.it.status === 'cancelled'}<span class="muted">Not answered</span>{/if}
				</div>{/if}
			{:else if b.kind === 'agent'}
				<div class="bot" title={when(b.it.startedAt)}>
					{#if blocks[bi - 1]?.kind !== 'agent'}<span class="who">{agentName}</span>{/if}
					<article class="markdown">{@html b.it.html}</article>
				</div>
			{:else}
				{@const live = !!sel.activeRunId && bi === blocks.length - 1}
				<details class="steps" open={live}>
					<summary>
						<Icon name="chevron" size={14} />
						<span>{live ? stepText(b.items.at(-1)!) : summary(b.items)}</span>
					</summary>
					<ul>
						{#each b.items as it, ii (ii)}
							<li class={it.type}>
								{#if it.type === 'command_execution'}
									<code>{it.input === 'Preparing workspace' ? it.title : it.input}</code>
								{:else if it.type === 'reasoning'}
									<p>{it.text}</p>
								{:else if it.type === 'checkpoint'}
									{@const files = it.files!}
									Changed {files.length} file{files.length > 1 ? 's' : ''}
									<span class="add">+{files.reduce((n, f) => n + f.additions, 0)}</span>
									<span class="del">−{files.reduce((n, f) => n + f.deletions, 0)}</span>
									{#each files.slice(0, 5) as f (f.path)}<code>{f.path}</code>{/each}{#if files.length > 5}and {files.length - 5} more{/if}
								{:else}
									{stepText(it)}
								{/if}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/each}
		{#if sel.activeRunId && !data.selected.pending.length && blocks.at(-1)?.kind !== 'steps'}<p class="working">Working…</p>{/if}
	</div>

	{#each data.selected.pending as r (r.id)}
		{#if r.questions}
			<form class="approval ask" method="POST" action="?/answer" use:enhance>
				<input type="hidden" name="thread" value={sel.id} /><input type="hidden" name="host" value={sel.host} />
				<input type="hidden" name="request" value={r.id} />
				<input type="hidden" name="questions" value={JSON.stringify(r.questions)} />
				{#each r.questions as q (q.id)}
					<fieldset>
						<legend><span class="qhead">{q.header}</span>{q.question}</legend>
						{#each q.options as o (o.label)}
							<label class="opt">
								<input type={q.multiSelect ? 'checkbox' : 'radio'} name="q:{q.id}" value={o.value ?? o.label} />
								<span><strong>{o.label}</strong>{#if o.description}<span class="muted">{o.description}</span>{/if}</span>
							</label>
						{/each}
						<input class="other" name="other:{q.id}" placeholder="Or type your own answer" autocomplete="off" />
					</fieldset>
				{/each}
				{#if form && 'answerError' in form}<p class="error">{String(form.answerError)}</p>{/if}
				<div class="row">
					<button class="primary">Answer</button>
					<button name="dismiss" value="1">Dismiss</button>
				</div>
			</form>
		{:else}
			{@const waiting = data.selected.items.findLast((i) => i.type === 'approval_request' && i.status !== 'completed')}
			<form class="approval" method="POST" action="?/respond" use:enhance>
				<strong>The agent wants to {kind(r.kind)}</strong>
				{#if waiting?.prompt}<code>{rel(waiting.prompt)}</code>{/if}
				<input type="hidden" name="thread" value={sel.id} /><input type="hidden" name="host" value={sel.host} />
				<input type="hidden" name="request" value={r.id} />
				<div class="row">
					<button class="primary" name="decision" value="accept">Allow once</button>
					<button name="decision" value="acceptForSession">Allow for this task</button>
					<button name="decision" value="decline">Deny</button>
				</div>
			</form>
		{/if}
	{/each}

	{#if form && 'actionError' in form}<p class="error action">{String(form.actionError)}</p>{/if}
	<form class="steer" method="POST" action="?/steer" use:enhance={() => async ({ update }) => update()}>
		<input type="hidden" name="thread" value={sel.id} /><input type="hidden" name="host" value={sel.host} />
		{#if sel.activeRunId}<input type="hidden" name="run" value={sel.activeRunId} />{/if}
		<textarea
			name="text"
			rows="1"
			placeholder={sel.activeRunId ? 'Steer the agent, e.g. "also check the tests"' : 'Reply…'}
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					e.currentTarget.form?.requestSubmit();
				}
			}}
		></textarea>
		<button class="primary">Send</button>
	</form>
</section>

<style>
	.state {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted);
	}
	.state::before {
		content: '●';
		margin-right: 0.3rem;
	}
	.state.run {
		color: var(--accent);
	}
	.state.ask {
		color: var(--warn);
	}
	.state.done::before {
		content: '✓';
	}
	.state.fail {
		color: var(--del-fg);
	}
	.detail {
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.steer {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		margin: 0 1rem 1rem;
		padding: 0.4rem 0.4rem 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
	}
	.steer:focus-within {
		border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
	}
	.steer textarea {
		flex: 1;
		field-sizing: content;
		min-height: 1.5em;
		max-height: 12em;
		padding: 0.35rem 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--fg);
		resize: none;
	}
	.steer textarea:focus {
		outline: none;
	}
	.detail header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1rem 0;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
		margin-right: auto;
	}
	.web {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.stop {
		color: var(--del-fg);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 1rem 1rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.approval {
		margin: 0 1rem 1rem;
		padding: 0.8rem 1rem;
		border: 1px solid var(--warn);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--warn) 8%, var(--bg));
		display: grid;
		gap: 0.5rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.log {
		display: grid;
		gap: 0.9rem;
		padding: 0.25rem 1rem 1.25rem;
		font-size: 0.92rem;
	}
	.you {
		justify-self: end;
		max-width: 80%;
		padding: 0.55rem 0.85rem;
		border-radius: 14px 14px 4px 14px;
		background: color-mix(in srgb, var(--accent) 16%, var(--bg));
	}
	.you p {
		margin: 0;
		white-space: pre-wrap;
	}
	.bot .markdown {
		line-height: 1.6;
	}
	.bot .markdown :global(> :last-child) {
		margin-bottom: 0;
	}
	.who {
		display: block;
		margin-bottom: 0.2rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted);
	}
	.steps {
		font-size: 0.82rem;
		color: var(--muted);
	}
	.steps summary {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: fit-content;
		max-width: 100%;
		cursor: pointer;
		list-style: none;
	}
	.steps summary::-webkit-details-marker {
		display: none;
	}
	.steps summary span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.steps summary:hover {
		color: var(--fg);
	}
	.steps summary :global(svg) {
		transform: rotate(-90deg);
		transition: transform 0.12s;
	}
	.steps[open] summary :global(svg) {
		transform: none;
	}
	.steps ul {
		list-style: none;
		margin: 0.4rem 0 0 0.45rem;
		padding: 0 0 0 0.9rem;
		border-left: 1px solid var(--border);
		display: grid;
		gap: 0.35rem;
	}
	.steps li code {
		display: inline;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.steps li.reasoning p {
		margin: 0;
		font-style: italic;
		white-space: pre-wrap;
	}
	.steps li.checkpoint code {
		margin-left: 0.35rem;
	}
	.asked {
		padding: 0.6rem 0.8rem;
		border-left: 2px solid var(--warn);
		background: color-mix(in srgb, var(--warn) 6%, transparent);
		border-radius: 0 8px 8px 0;
	}
	.asked p {
		margin: 0.15rem 0;
	}
	.ask fieldset {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.ask legend {
		margin-bottom: 0.4rem;
		font-weight: 600;
	}
	.qhead {
		display: block;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--warn);
	}
	.opt {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		cursor: pointer;
	}
	.opt:has(input:checked) {
		border-color: var(--accent);
	}
	.opt input {
		margin-top: 0.2rem;
	}
	.opt > span {
		display: grid;
		gap: 0.1rem;
		font-size: 0.88rem;
	}
	.other {
		padding: 0.45rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 0.88rem;
	}
	.error.action {
		margin: 0 1rem 0.6rem;
	}
	.working {
		margin: 0;
		font-size: 0.82rem;
		color: var(--accent);
	}
	.add {
		color: var(--add-fg);
	}
	.del {
		color: var(--del-fg);
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
		background: var(--surface);
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.85rem;
		margin: 0.4rem 0.75rem;
	}
</style>
