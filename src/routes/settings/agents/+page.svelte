<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const command = $derived(form?.key ? `claude mcp add --transport http forge ${page.url.origin}/mcp --header "Authorization: Bearer ${form.key}"` : '');
	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(command);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const LABELS: Record<string, string> = {
		comment_on_pull_request: 'comment on a PR',
		comment_on_line: 'comment on a line',
		reply_to_thread: 'reply in a thread',
		resolve_thread: 'resolve a thread',
		open_pull_request: 'open a PR',
		merge_pull_request: 'merge a PR'
	};
	const mint = 't3 auth session issue --scope orchestration:read --scope orchestration:operate --scope source-control:write --label forge';
	const label = (tool: string) => LABELS[tool] ?? tool.replaceAll('_', ' ');
	const details = (args: Record<string, string | number | undefined>) => Object.entries(args).filter(([k, v]) => k !== 'repo' && v !== undefined && v !== '');

	// Agents queue requests at any time, so check for new ones while this page is open.
	$effect(() => {
		const timer = setInterval(invalidateAll, 5000);
		return () => clearInterval(timer);
	});
</script>

<h1>Agents</h1>
<p class="muted">
	Let an agent (Claude Code, Codex, anything that speaks MCP) work on your repos through forge. Each key acts as you and can read PRs, comment, resolve threads and open PRs. It can never merge.
</p>

{#if data.pending.length}
	<section class="waiting">
		<h2>Waiting on you <span class="count">{data.pending.length}</span></h2>
		{#each data.pending as a (a.id)}
			<article>
				<div class="head">
					<div><strong>{a.keyName}</strong> wants to {label(a.tool)} in <a href="/{a.repo}">{a.repo}</a></div>
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
	</section>
{/if}
{#if form?.error && !form.key}<p class="error">{form.error}</p>{/if}

{#if form?.key}
	<section class="new">
		<strong>{form.name}</strong> is ready. This key is shown once. Run this wherever the agent runs:
		<pre>{command}</pre>
		<button onclick={copy}>{copied ? 'Copied' : 'Copy command'}</button>
	</section>
{/if}


<h2>Keys</h2>
<ul class="list">
	{#each data.keys as k (k.id)}
		<li class="key">
			<div class="top">
			<div>
				<strong>{k.name}</strong>
				<span class="muted">
					{k.repos.includes('*') ? 'all repos' : k.repos.join(', ')} · {k.allow.length ? `can ${k.allow.map(label).join(', ')} · ` : ''}{k.ask.length ? `asks first: ${k.ask.map(label).join(', ')}` : 'never asks'} · created {ago(k.createdAt)} · {k.lastUsedAt
						? `used ${ago(k.lastUsedAt)}`
						: 'never used'}
				</span>
			</div>
			<form method="POST" action="?/revoke" use:enhance>
				<input type="hidden" name="id" value={k.id} />
				<button>Revoke</button>
			</form>
			</div>
			<details>
				<summary class="muted">Edit</summary>
				<form class="edit" method="POST" action="?/edit" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<input type="hidden" name="id" value={k.id} />
					<div class="row">
						<input name="name" value={k.name} aria-label="Agent name" required />
						<input name="repos" value={k.repos.includes('*') ? '' : k.repos.join(' ')} placeholder="All repos" aria-label="Repositories" />
						<button class="primary">Save</button>
					</div>
					<fieldset>
						<legend class="muted">Also allow it to</legend>
						{#each data.optInTools as t (t)}
							<label><input type="checkbox" name="allow" value={t} checked={k.allow.includes(t)} /> {label(t)}</label>
						{/each}
					</fieldset>
					<fieldset>
						<legend class="muted">Ask me first before it can</legend>
						{#each data.writeTools as t (t)}
							<label><input type="checkbox" name="ask" value={t} checked={k.ask.includes(t)} /> {label(t)}</label>
						{/each}
					</fieldset>
				</form>
			</details>
		</li>
	{:else}
		<li class="muted">No keys yet.</li>
	{/each}
</ul>

<section class="newkey">
	<h3>New key</h3>
	<form class="create" method="POST" action="?/create" use:enhance>
		<div class="row">
			<input name="name" placeholder="Claude Code · laptop" aria-label="Agent name" required />
			<input name="repos" placeholder="Repos (owner/name, space separated; empty for all)" aria-label="Repositories" />
			<button class="primary">Create key</button>
		</div>
		<fieldset>
			<legend class="muted">Also allow it to</legend>
			{#each data.optInTools as t (t)}
				<label><input type="checkbox" name="allow" value={t} /> {label(t)}</label>
			{/each}
		</fieldset>
		<fieldset>
			<legend class="muted">Ask me first before it can</legend>
			{#each data.writeTools as t (t)}
				<label><input type="checkbox" name="ask" value={t} checked={t === 'open_pull_request' || t === 'merge_pull_request'} /> {label(t)}</label>
			{/each}
		</fieldset>
	</form>
</section>

<h2 id="t3">T3 Code</h2>
<p class="muted">
	Drive <a href="https://t3.codes">T3 Code</a> agents from forge: start tasks from a repo's Agents tab, answer their permission requests and steer them. A repo runs on any
	host with a T3 project of the same name.
</p>
<ol class="steps muted">
	<li>In T3 Code on the host, open <strong>Settings → Connections</strong> and create a pairing link.</li>
	<li>Paste it below within 5 minutes. forge swaps it for a token that lasts 30 days.</li>
</ol>
<ul class="list">
	{#each data.t3 as h (h.id)}
		<li>
			<div>
				<strong>{h.name}</strong>
				<span class="muted">{h.url} ·</span>
				{#if h.error}<span class="bad">{h.error}</span>{:else}<span class="ok">connected</span><span class="muted"> · {h.projects} project{h.projects === 1 ? '' : 's'}</span>{/if}
				{#if h.expiresAt}<span class="muted"> · {Date.parse(h.expiresAt) < Date.now() ? 'pairing expired, pair again' : `pairing ends ${ago(h.expiresAt)}`}</span>{/if}
			</div>
			{#if h.id === 'env'}
				<span class="muted">from .env</span>
			{:else}
				<form method="POST" action="?/removeHost" use:enhance>
					<input type="hidden" name="id" value={h.id} />
					<button>Remove</button>
				</form>
			{/if}
		</li>
	{:else}
		<li class="muted">No hosts yet.</li>
	{/each}
</ul>
<form class="create" method="POST" action="?/addHost" use:enhance>
	<div class="row">
		<input name="name" placeholder="Name, e.g. laptop" aria-label="Host name" />
		<input name="link" type="password" placeholder="Pairing link (http://laptop:3773/pair#token=…)" aria-label="Pairing link" autocomplete="off" />
		<button class="primary">Connect</button>
	</div>
	<details>
		<summary class="muted">Or use a URL and token from the CLI</summary>
		<p class="muted">On the host: <code>{mint}</code></p>
		<div class="row">
			<input name="url" placeholder="http://laptop:3773" aria-label="Host URL" />
			<input name="token" type="password" placeholder="Token" aria-label="Token" autocomplete="off" />
		</div>
	</details>
	{#if form?.hostError}<p class="error">{form.hostError}</p>{/if}
</form>

{#if data.decided.length}
	<details class="log">
	<summary><h2>Recent decisions</h2></summary>
	<ul class="list">
		{#each data.decided as a (a.id)}
			<li>
				<div>
					<strong>{a.keyName}</strong> {label(a.tool)} in <a href="/{a.repo}">{a.repo}</a>
					<span class="status {a.status}">{a.status}</span>
					{#if a.status === 'failed'}<span class="muted">{a.result}</span>{/if}
				</div>
				<span class="muted">{a.decidedAt ? ago(a.decidedAt) : ''}</span>
			</li>
		{/each}
	</ul>
	</details>
{/if}

<details class="log">
<summary><h2>Activity</h2></summary>
<ul class="list">
	{#each data.activity as a (a.at + a.keyId + a.action)}
		<li>
			<div><strong>{a.name}</strong> <code>{a.action}</code> <a href="/{a.repo}">{a.repo}</a></div>
			<span class="muted">{ago(a.at)}</span>
		</li>
	{:else}
		<li class="muted">Nothing yet.</li>
	{/each}
</ul>
</details>

<style>
	.new,
	.waiting {
		margin: 1rem 0;
		padding: 1rem;
		border: 1px solid var(--accent);
		border-radius: 8px;
		background: var(--surface);
	}
	.waiting h2 {
		margin: 0 0 0.5rem;
		font-size: 1.05rem;
	}
	.count {
		margin-left: 0.3rem;
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.8rem;
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
	.reason {
		margin: 0.4rem 0 0;
		font-size: 0.9rem;
		color: var(--accent);
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
		white-space: pre-wrap;
		word-break: break-all;
		font-family: var(--mono);
		font-size: 0.85rem;
	}
	.create {
		margin: 0;
	}
	.newkey {
		margin: 1rem 0 0;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
	.newkey h3 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
	}
	.newkey .row input {
		background: var(--bg);
	}
	.log {
		margin-top: 1.5rem;
	}
	.log summary {
		cursor: pointer;
		list-style: none;
	}
	.log summary::-webkit-details-marker {
		display: none;
	}
	.log summary h2 {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: 1.1rem;
	}
	.log summary h2::before {
		content: '›';
		color: var(--muted);
		transition: transform 0.12s;
	}
	.log[open] summary h2::before {
		transform: rotate(90deg);
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.row input {
		font: inherit;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.row input:first-child {
		width: 14rem;
	}
	.row input:nth-child(2) {
		flex: 1;
		min-width: 0;
	}
	.steps {
		margin: 0 0 0.75rem;
		padding-left: 1.2rem;
		line-height: 1.6;
	}
	fieldset {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.2rem;
		margin: 0.6rem 0 0;
		padding: 0;
		border: 0;
		font-size: 0.9rem;
	}
	legend {
		float: left;
		padding: 0;
		margin-right: 1.2rem;
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}
	.error {
		color: var(--del-fg);
	}
	.ok {
		color: var(--add-fg);
	}
	.bad {
		color: var(--del-fg);
	}
	.status {
		margin-left: 0.4rem;
		font-size: 0.75rem;
		padding: 0 0.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.status.approved {
		border-color: var(--accent);
		color: var(--accent);
	}
	.status.denied,
	.status.failed {
		color: var(--muted);
		text-decoration: line-through;
	}
	.list {
		list-style: none;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.7rem 1rem;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li.key {
		display: block;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	summary {
		cursor: pointer;
		width: max-content;
		margin-top: 0.3rem;
	}
	.edit {
		margin: 0.6rem 0 0.3rem;
	}
	.list .muted {
		font-size: 0.85rem;
	}
	.list div .muted {
		margin-left: 0.5rem;
	}
</style>
