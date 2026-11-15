<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { kind, rel, status } from '#lib/agent-status.js';
	import Icon from '#lib/components/Icon.svelte';
	import NewTask from '#lib/components/NewTask.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const t3 = $derived(data.t3);
	const waiting = $derived(data.pending.length + (t3?.asks.length ?? 0));
	const running = $derived(t3?.threads.filter((t) => t.activeRunId || t.pendingRuntimeRequest) ?? []);
	const recent = $derived(t3?.threads.filter((t) => !t.activeRunId && !t.pendingRuntimeRequest).slice(0, 10) ?? []);
	const link = (t: { id: string; host: string }) => `/agents/${encodeURIComponent(t.host)}/${encodeURIComponent(t.id)}`;

	const LABELS: Record<string, string> = {
		comment_on_pull_request: 'comment on a PR',
		comment_on_line: 'comment on a line',
		reply_to_thread: 'reply in a thread',
		resolve_thread: 'resolve a thread',
		open_pull_request: 'open a PR'
	};
	const label = (tool: string) => LABELS[tool] ?? tool.replaceAll('_', ' ');
	const details = (args: Record<string, string | number | undefined>) => Object.entries(args).filter(([k, v]) => k !== 'repo' && v !== undefined && v !== '');

	// Faster while an agent works; slower otherwise, since MCP agents can still queue requests.
	$effect(() => {
		const timer = setInterval(invalidateAll, running.length ? 2000 : 5000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Agents · forge</title></svelte:head>

<header class="top">
	<h1>Agents</h1>
	<p class="muted">What your coding agents are doing. Anything that needs a human waits here.</p>
</header>

<div class="cols">
	<div class="main">
		{#if t3?.targets.length}
			<NewTask pickRepo targets={t3.targets} error={form && 'launchError' in form ? form.launchError : undefined} />
		{/if}
		<section class="card" class:hot={waiting}>
			<h2>Waiting on you <span class="count" class:zero={!waiting}>{waiting}</span></h2>
			{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}
			{#each t3?.asks ?? [] as a (a.thread.host + a.request.id)}
				<article>
					<div class="head">
						<div><strong>{a.thread.title}</strong> {a.questions ? 'has a question' : `wants to ${kind(a.request.kind)}`}{#if a.thread.repo}&nbsp;in <a href="/{a.thread.repo}">{a.thread.repo}</a>{/if}</div>
						<span class="muted">{ago(a.request.createdAt)}</span>
					</div>
					{#if a.questions}
						{#each a.questions as q (q)}<p class="q">{q}</p>{/each}
						<a class="button primary" href={link(a.thread)}>Answer</a>
					{:else}
					{#if a.prompt}<pre>{rel(a.prompt)}</pre>{/if}
					<form method="POST" action="?/respond" use:enhance>
						<input type="hidden" name="thread" value={a.thread.id} />
						<input type="hidden" name="host" value={a.thread.host} />
						<input type="hidden" name="request" value={a.request.id} />
						<button class="primary" name="decision" value="accept">Allow once</button>
						<button name="decision" value="acceptForSession">Allow for this task</button>
						<button name="decision" value="decline">Deny</button>
						<a class="open" href={link(a.thread)}>Open task</a>
					</form>
					{/if}
				</article>
			{/each}
			{#each data.pending as a (a.id)}
				<article>
					<div class="head">
						<div><span class="who">{a.keyName}</span> wants to {label(a.tool)} in <a href="/{a.repo}">{a.repo}</a></div>
						<span class="muted">{ago(a.at)}</span>
					</div>
					{#if a.reason}<p class="reason">{a.reason}</p>{/if}
					<dl>
						{#each details(a.args) as [k, v] (k)}
							<dt>{k.replaceAll('_', ' ')}</dt>
							<dd>{v}</dd>
						{/each}
					</dl>
					<form method="POST" use:enhance>
						<input type="hidden" name="id" value={a.id} />
						<button formaction="?/approve" class="primary">Approve</button>
						<button formaction="?/deny">Deny</button>
					</form>
				</article>
			{/each}
			{#if !waiting}<p class="muted none">Nothing right now.</p>{/if}
		</section>

		{#if !t3}
			<section class="card">
				<h2>Tasks</h2>
				<p class="muted none">Connect T3 Code in <a href="/settings/agents">Settings → Agents</a> to start and watch agent tasks from Shed.</p>
			</section>
		{:else}
			{#each t3.down as d (d.name)}<p class="down">{d.name} is unreachable: {d.error}</p>{/each}
			<section class="card flush">
				<h2>Tasks {#if running.length}<span class="count run">{running.length} running</span>{/if}</h2>
				<ul class="tasks">
					{#each [...running, ...recent] as t (t.host + t.id)}
						{@const s = status(t)}
						<li>
							<a href={link(t)}>
								<span class="state {s.kind}">{s.label}</span>
								<strong>{t.title}</strong>
								<span class="muted">{t.repo ?? `${t.project} (T3 only)`} · {t.model}{t3.multi ? ` · on ${t.hostName}` : ''}</span>
								<span class="muted age">{ago(t.updatedAt)}</span>
							</a>
							<div class="acts">
								<a href={t.web} target="_blank" rel="noopener" title="Open in T3 Code" aria-label="Open {t.title} in T3 Code"><Icon name="external" size={14} /></a>
								{#if !t.activeRunId && !t.pendingRuntimeRequest}
									<form method="POST" action="?/dismiss" use:enhance>
										<input type="hidden" name="host" value={t.host} />
										<input type="hidden" name="thread" value={t.id} />
										<input type="hidden" name="updatedAt" value={t.updatedAt} />
										<button title="Dismiss" aria-label="Dismiss {t.title}"><Icon name="x" size={14} /></button>
									</form>
								{/if}
							</div>
						</li>
					{:else}
						<li class="muted none">No tasks yet. Start one from a repo's Agents tab.</li>
					{/each}
				</ul>
			</section>
		{/if}

		<details class="card flush activity">
			<summary>
				<h2>
					<Icon name="chevron" size={14} />Activity
					{#if data.activity[0]}<span class="muted latest">latest {ago(data.activity[0].at)}</span>{/if}
					<a class="more" href="/settings/agents">Full log</a>
				</h2>
			</summary>
			<ul class="tasks">
				{#each data.activity as a (a.at + a.keyId + a.action)}
					<li class="row">
						<div><span class="who">{a.name}</span> <code>{a.action}</code> in <a href="/{a.repo}">{a.repo}</a></div>
						<span class="muted age">{ago(a.at)}</span>
					</li>
				{:else}
					<li class="muted none">No agent has used a key yet.</li>
				{/each}
			</ul>
		</details>
	</div>

	<aside>
		<section class="card">
			<h2>Your keys</h2>
			{#each data.keys as k (k.id)}
				<div class="key">
					<strong>{k.name}</strong>
					<span class="muted">{k.repos.includes('*') ? 'all repos' : k.repos.join(', ')} · {k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : 'never used'}</span>
				</div>
			{:else}
				<p class="muted">No keys yet.</p>
			{/each}
			<a class="button" href="/settings/agents">Manage keys</a>
		</section>
		<section class="card connect">
			<h2>Connect an agent</h2>
			<p class="muted">Give Claude Code, Codex or any MCP agent a key. It acts as you, follows each repo's <code>.forge/agents.json</code>, and can never merge.</p>
			<a class="button primary" href="/settings/agents">Create a key</a>
		</section>
	</aside>
</div>

<style>
	.top h1 {
		margin: 0 0 0.25rem;
	}
	.top p {
		margin: 0 0 1.5rem;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 1.25rem;
		align-items: start;
	}
	.main,
	aside {
		display: grid;
		gap: 1.25rem;
	}
	.card {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1rem 1.1rem;
	}
	.card.hot {
		border-color: var(--warn);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--warn) 40%, transparent);
	}
	.card.flush {
		padding: 1rem 0 0;
	}
	.card.flush h2 {
		padding: 0 1.1rem;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}
	.count {
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--warn);
		color: var(--bg);
		font-size: 0.75rem;
	}
	.count.run {
		background: var(--accent);
	}
	.count.zero {
		background: var(--surface);
		color: var(--muted);
	}
	.activity:not([open]) {
		padding-bottom: 0.4rem;
	}
	.activity summary {
		cursor: pointer;
		list-style: none;
	}
	.activity summary::-webkit-details-marker {
		display: none;
	}
	.activity summary :global(svg) {
		color: var(--muted);
		transform: rotate(-90deg);
		transition: transform 0.12s;
	}
	.activity[open] summary :global(svg) {
		transform: none;
	}
	.latest {
		font-size: 0.8rem;
		font-weight: 400;
	}
	.more {
		margin-left: auto;
		font-size: 0.85rem;
		font-weight: 400;
	}
	.none {
		margin: 0;
		padding: 0.25rem 0 0.1rem;
		font-size: 0.9rem;
	}
	.card.flush .none {
		padding: 0.75rem 1.1rem;
	}
	article {
		padding: 0.75rem 0;
	}
	article + article {
		border-top: 1px solid var(--border);
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.who {
		font-weight: 600;
		color: var(--accent);
	}
	.reason {
		margin: 0.4rem 0 0;
		font-size: 0.9rem;
		color: var(--warn);
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.2rem 0.9rem;
		margin: 0.5rem 0 0.75rem;
		font-size: 0.9rem;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	pre {
		margin: 0.5rem 0 0.75rem;
		padding: 0.5rem 0.7rem;
		background: var(--surface);
		border-radius: 6px;
		font-family: var(--mono);
		font-size: 0.82rem;
		white-space: pre-wrap;
		word-break: break-all;
	}
	article form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.q {
		margin: 0.4rem 0 0.6rem;
	}
	.open {
		margin-left: auto;
		font-size: 0.9rem;
	}
	.tasks {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tasks li {
		position: relative;
		border-top: 1px solid var(--border);
	}
	.acts {
		position: absolute;
		right: 0.8rem;
		bottom: 0.5rem;
		display: flex;
		gap: 0.15rem;
		padding: 0.1rem;
		border-radius: 6px;
		background: var(--surface);
		visibility: hidden;
	}
	.tasks li:hover .acts,
	.acts:focus-within {
		visibility: visible;
	}
	.acts a,
	.acts button {
		display: flex;
		padding: 0.25rem;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--muted);
	}
	.acts a:hover,
	.acts button:hover {
		color: var(--fg);
		background: var(--bg);
	}
	.tasks li > a,
	.tasks li.row {
		display: grid;
		grid-template-columns: 7.5rem 1fr auto;
		align-items: baseline;
		gap: 0.1rem 0.75rem;
		padding: 0.6rem 1.1rem;
		color: var(--fg);
	}
	.tasks li.row {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
	}
	.tasks a[href]:hover {
		background: var(--surface);
	}
	.tasks strong {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tasks a .muted:not(.age) {
		grid-column: 2;
		font-size: 0.82rem;
	}
	.age {
		grid-row: 1;
		grid-column: 3;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.state {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted);
		white-space: nowrap;
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
	code {
		font-family: var(--mono);
		font-size: 0.82em;
		background: var(--surface);
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
	}
	.key {
		display: grid;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}
	.key .muted {
		font-size: 0.8rem;
	}
	article .button {
		display: inline-block;
		font-size: 0.9rem;
	}
	aside .button {
		display: inline-block;
		margin-top: 0.75rem;
		font-size: 0.9rem;
	}
	.button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		font-weight: 600;
	}
	.connect {
		background: var(--surface);
	}
	.connect p {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.connect code {
		background: var(--bg);
	}
	.error {
		color: var(--del-fg);
	}
	.down {
		margin: 0;
		font-size: 0.85rem;
		color: var(--warn);
	}
	@media (max-width: 900px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
