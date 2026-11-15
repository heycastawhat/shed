<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import Pager from '#lib/components/Pager.svelte';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const STATE: Record<string, [string, string]> = {
		success: ['check', 'ok'],
		failure: ['x', 'bad'],
		cancelled: ['x', 'off'],
		skipped: ['right', 'off'],
		running: ['refresh', 'live'],
		waiting: ['clock', 'live'],
		blocked: ['clock', 'off']
	};
	const took = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);
</script>

<svelte:head><title>Actions · {data.repo.full_name}</title></svelte:head>

{#if data.dispatchable.length && data.repo.permissions.push}
	<details class="dispatch">
		<summary>Run a workflow</summary>
		{#each data.dispatchable as w (w.id)}
			<form method="POST" action="?/dispatch">
				<input type="hidden" name="workflow" value={w.id} />
				<strong>{w.name}</strong>
				<label>Branch <select name="ref">{#each data.branches as b (b)}<option selected={b === data.repo.default_branch}>{b}</option>{/each}</select></label>
				{#each Object.entries(w.inputs) as [name, input] (name)}
					<label>{name} <input name="input:{name}" value={String((input as { default?: unknown })?.default ?? '')} /></label>
				{/each}
				<button class="primary">Run</button>
			</form>
		{/each}
	</details>
{/if}

<ul class="runs">
	{#each data.runs as r (r.id)}
		{@const [icon, tone] = STATE[r.status] ?? ['clock', 'off']}
		<li>
			<span class="state {tone}" title={r.status}><Icon name={icon} size={15} /></span>
			<div class="main">
				<a href="/{data.repo.full_name}/actions/runs/{r.number}"><strong>{r.title}</strong></a>
				<div class="meta">
					{r.workflow} #{r.number} · {r.event}{#if r.who}{' by '}<a href="/{r.who}">{r.who}</a>{/if} · <code>{r.ref}</code> ·
					<a href="/{data.repo.full_name}/commit/{r.sha}"><code>{r.sha.slice(0, 7)}</code></a>
				</div>
			</div>
			<div class="when muted">
				<span>{ago(r.created)}</span>
				{#if r.duration !== null}<span><Icon name="clock" size={12} />{took(r.duration)}</span>{/if}
			</div>
		</li>
	{:else}
		<li class="empty">
			<Icon name="actions" size={28} />
			<strong>No workflow runs yet</strong>
			<span class="muted">Add a workflow under <code>.forgejo/workflows/</code> to run CI on pushes and pull requests.</span>
		</li>
	{/each}
</ul>

<Pager page={data.page} total={data.total} size={data.size} />

<style>
	.dispatch {
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 1rem;
	}
	.dispatch summary {
		cursor: pointer;
		font-weight: 500;
	}
	.dispatch form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding-top: 0.75rem;
	}
	.dispatch label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.dispatch input,
	.dispatch select {
		font: inherit;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	.runs {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	li {
		display: flex;
		gap: 0.8rem;
		align-items: baseline;
		padding: 0.8rem 1rem;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li:not(.empty):hover {
		background: var(--surface);
	}
	.main {
		flex: 1;
		min-width: 0;
	}
	.main > a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--fg);
	}
	strong {
		font-weight: 500;
	}
	.meta,
	.when {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.meta a {
		color: var(--muted);
	}
	.when {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		white-space: nowrap;
	}
	.when span {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.state {
		align-self: center;
		display: grid;
		color: var(--muted);
	}
	.ok {
		color: var(--add-fg);
	}
	.bad {
		color: var(--del-fg);
	}
	.live {
		color: var(--warn);
	}
	.empty {
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 2.5rem 1rem;
		text-align: center;
		color: var(--muted);
	}
	.empty strong {
		color: var(--fg);
	}
	@media (max-width: 700px) {
		.when {
			display: none;
		}
	}
</style>
