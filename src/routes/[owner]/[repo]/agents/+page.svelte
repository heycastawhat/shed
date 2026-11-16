<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { status } from '#lib/agent-status.js';
	import NewTask from '#lib/components/NewTask.svelte';
	import TaskView from '#lib/components/TaskView.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const sel = $derived(data.selected?.thread);
	const selModels = $derived(data.hosts.find((h) => h.id === sel?.host)?.models ?? []);

	// T3 has a live event stream, but polling the projection while something runs keeps forge stateless.
	$effect(() => {
		if (!data.threads.some((t) => t.activeRunId || t.pendingRuntimeRequest) && !data.cloning.some((c) => c.phase === 'running')) return;
		const timer = setInterval(invalidateAll, 2000);
		return () => clearInterval(timer);
	});
</script>

{#each data.down as d (d.name)}
	<p class="down">{d.name} is unreachable: {d.error}</p>
{/each}
{#each data.cloning as c (c.host)}
	<form class="setup" method="POST" action="?/retry" use:enhance>
		{#if c.phase === 'running'}
			<h2>Cloning {data.repo.name} on {c.name}…</h2>
			<p class="muted">{c.percent ?? 0}%</p>
		{:else}
			<h2>Cloning {data.repo.name} on {c.name} failed</h2>
			<p class="error">{c.error}</p>
			<p class="muted">T3 Code runs git without prompts, so the host's SSH key has to be on your account (Settings → SSH keys) and this server's host key in the host's known_hosts.</p>
			<input type="hidden" name="host" value={c.host} />
			<input type="hidden" name="project" value={c.project} />
			<button class="primary">Try again</button>
			{#if form && 'setupError' in form}<p class="error">{form.setupError}</p>{/if}
		{/if}
	</form>
{/each}
{#if !data.hosts.length && !data.cloning.length}
	<form class="setup" method="POST" action="?/setup" use:enhance>
		<h2>Set up {data.repo.name} for agents</h2>
		<p class="muted">T3 Code clones the repo onto the host and adds it as a project. Agents then work there, each task in its own worktree.{#if data.repo.ssh_url} It clones over SSH, so add the host's SSH key to your account first.{/if}</p>
		{#if data.reachable.length > 1}
			<select name="host" aria-label="Host">
				{#each data.reachable as h (h.id)}<option value={h.id}>on {h.name}</option>{/each}
			</select>
		{:else}
			<input type="hidden" name="host" value={data.reachable[0]?.id} />
		{/if}
		<button class="primary" disabled={!data.reachable.length}>Clone into T3 Code{data.reachable.length === 1 ? ` on ${data.reachable[0].name}` : ''}</button>
		{#if form && 'setupError' in form}<p class="error">{form.setupError}</p>{/if}
	</form>
{:else if data.hosts.length}
	<div class="agents" class:solo={!data.threads.length}>
		<aside>
			<NewTask targets={[{ repo: data.repo.full_name, base: data.repo.default_branch, hosts: data.hosts }]} error={form?.error} />
			<ul>
				{#each data.threads as t (t.host + t.id)}
					{@const s = status(t)}
					<li>
						<a href="?host={encodeURIComponent(t.host)}&thread={encodeURIComponent(t.id)}" class:on={t.id === sel?.id && t.host === sel?.host}>
							<span class="state {s.kind}">{s.label}</span>
							<span class="age">{ago(t.updatedAt)}</span>
							<strong>{t.title}</strong>
							{#if t.branch}<code>{t.branch}</code>{/if}
							{#if data.hosts.length > 1}<span class="on-host">on {t.hostName}</span>{/if}
						</a>
					</li>
				{:else}
					<li class="muted empty">No agent tasks yet.</li>
				{/each}
			</ul>
		</aside>

		{#if data.selected}
			<TaskView thread={data.selected.thread} items={data.selected.items} pending={data.selected.pending} models={selModels} {form} poll={false} />
		{/if}
	</div>
{/if}

<style>
	.agents {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}
	.agents.solo {
		grid-template-columns: minmax(0, 40rem);
	}
	@media (max-width: 800px) {
		.agents {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	aside ul {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	aside a {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.2rem 0.5rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--fg);
	}
	aside a.on {
		border-color: var(--accent);
	}
	aside strong {
		grid-column: 1 / -1;
		font-weight: 500;
	}
	aside code {
		grid-column: 1 / -1;
		color: var(--muted);
		font-size: 0.75rem;
	}
	.age {
		color: var(--muted);
		font-size: 0.75rem;
	}
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
	.empty {
		padding: 0.5rem 0;
	}
	.setup {
		display: grid;
		justify-items: start;
		gap: 0.75rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.setup h2,
	.setup p {
		margin: 0;
	}
	.down {
		margin: 0 0 1rem;
		font-size: 0.85rem;
		color: var(--warn);
	}
	.on-host {
		grid-column: 1 / -1;
		color: var(--muted);
		font-size: 0.75rem;
	}
</style>
