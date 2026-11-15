<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const STATE: Record<string, [string, string]> = {
		success: ['check', 'ok'],
		failure: ['x', 'bad'],
		cancelled: ['x', 'off'],
		skipped: ['right', 'off'],
		running: ['refresh', 'live'],
		waiting: ['clock', 'live'],
		blocked: ['clock', 'off']
	};
	const base = $derived(`/${data.repo.full_name}/actions/runs/${data.run.index_in_repo}`);
	const live = $derived(data.run.status === 'running' || data.run.status === 'waiting');
	const took = (a: string | null, b: string | null) => {
		if (!a) return '';
		const s = ((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000;
		return s < 60 ? `${Math.max(0, Math.round(s))}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
	};

	// While anything is running, reload every 2s; the log follows the end unless you've scrolled up.
	$effect(() => {
		if (!live) return;
		const t = setInterval(() => invalidateAll(), 2000);
		return () => clearInterval(t);
	});
	let open = $state<Record<number, boolean>>({});
	const isOpen = (s: { id: number; result: string | null }) => open[s.id] ?? (s.result === 'failure' || !s.result);
</script>

<svelte:head><title>{data.run.title} · Actions · {data.repo.full_name}</title></svelte:head>

{#snippet badge(status: string)}
	{@const [icon, tone] = STATE[status] ?? ['clock', 'off']}
	<span class="state {tone}" title={status}><Icon name={icon} size={16} /></span>
{/snippet}

<header class="run">
	<div class="title">
		{@render badge(data.run.status)}
		<h2>{data.run.title} <span class="muted">#{data.run.index_in_repo}</span></h2>
	</div>
	<div class="meta muted">
		{data.run.name} · {data.run.event}{#if data.run.trigger_user}{' by '}<a href="/{data.run.trigger_user.login}">{data.run.trigger_user.login}</a>{/if} ·
		<code>{data.run.prettyref}</code> · <a href="/{data.repo.full_name}/commit/{data.run.commit_sha}"><code>{data.run.commit_sha.slice(0, 7)}</code></a> ·
		{ago(data.run.created)}{#if data.run.run_attempt > 1}{' · '}attempt {data.run.run_attempt}{/if}
	</div>
	{#if data.repo.permissions.push}
		<div class="actions">
			{#if live}
				<form method="POST" action="?/cancel" use:enhance><button>Cancel run</button></form>
			{:else}
				{#if data.run.jobs.some((j) => j.status === 'failure' || j.status === 'cancelled')}
					<form method="POST" action="?/rerunFailed" use:enhance><button class="primary">Re-run failed jobs</button></form>
				{/if}
				<form method="POST" action="?/rerun" use:enhance><button>Re-run all jobs</button></form>
			{/if}
		</div>
	{/if}
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
</header>

<div class="layout">
	<nav aria-label="Jobs">
		{#each data.run.jobs as j (j.id)}
			<a href="{base}?job={j.id}" class:on={j.id === data.job?.id} data-sveltekit-replacestate>
				{@render badge(j.status)}
				<span class="name">{j.name}</span>
				<span class="muted small">{took(j.started_at, j.completed_at)}</span>
			</a>
		{/each}
	</nav>

	{#if data.job}
		<section class="job">
			<h3>
				{data.job.name}
				<span class="muted small">
					{#if data.job.runner}on {data.job.runner}{:else if data.job.status === 'waiting'}waiting for a runner with {data.job.runs_on.join(', ') || 'any label'}{:else if data.job.status === 'blocked'}waiting for {data.job.needs.join(', ')}{/if}
				</span>
			</h3>
			<div class="log">
				{#if data.setup.length}
					<details>
						<summary><Icon name="right" size={12} />Set up job</summary>
						<pre>{#each data.setup as l, i (i)}<span>{l.text}</span>{/each}</pre>
					</details>
				{/if}
				{#each data.steps as s (s.id)}
					<details open={isOpen(s)} ontoggle={(e) => (open[s.id] = e.currentTarget.open)}>
						<summary>
							{@render badge(s.result ?? (data.job.status === 'running' ? 'running' : 'waiting'))}
							<span class="name">{s.name}</span>
							<span class="muted small">{took(s.started_at, s.stopped_at)}</span>
						</summary>
						<pre>{#each s.lines as l, i (i)}<span title={l.time}>{l.text}</span>{/each}</pre>
					</details>
				{/each}
				{#if data.teardown.length}
					<details>
						<summary><Icon name="right" size={12} />Complete job</summary>
						<pre>{#each data.teardown as l, i (i)}<span>{l.text}</span>{/each}</pre>
					</details>
				{/if}
				{#if !data.steps.length && !data.setup.length}<p class="muted pad">No output yet.</p>{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.run {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 1.2rem;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.layout {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr);
		gap: 1.2rem;
		align-items: start;
	}
	nav {
		display: grid;
		gap: 0.1rem;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		color: var(--fg);
		text-decoration: none;
	}
	nav a.on,
	nav a:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.small {
		font-size: 0.82rem;
	}
	h3 {
		margin: 0 0 0.6rem;
		font-size: 1rem;
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
	}
	.log {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		overflow: hidden;
	}
	details + details {
		border-top: 1px solid var(--border);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.8rem;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	pre {
		margin: 0;
		padding: 0.4rem 0.8rem 0.6rem 2.4rem;
		font-size: 0.8rem;
		line-height: 1.5;
		overflow-x: auto;
		counter-reset: line;
	}
	pre span {
		display: block;
		white-space: pre-wrap;
		word-break: break-word;
	}
	pre span::before {
		counter-increment: line;
		content: counter(line);
		display: inline-block;
		width: 2.2rem;
		margin-left: -2.6rem;
		margin-right: 0.4rem;
		text-align: right;
		color: var(--muted);
		user-select: none;
	}
	.pad {
		padding: 0.8rem;
		margin: 0;
	}
	.state {
		display: inline-flex;
	}
	.state.ok {
		color: var(--add-fg);
	}
	.state.bad {
		color: var(--del-fg);
	}
	.state.live {
		color: var(--warn);
	}
	.state.off {
		color: var(--muted);
	}
	.error {
		color: var(--del-fg);
	}
	@media (max-width: 700px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
