<script lang="ts">
	import { enhance } from '$app/forms';

	type Option = { id: string; label: string; isDefault?: boolean };
	type Model = { instanceId: string; provider: string; slug: string; name: string; reasoning?: { id: string; options: Option[] } };
	type Host = { id: string; name: string; models: Model[]; last?: { model: string; reasoning?: string } };
	// One target per repo the task could run in; each lists the T3 hosts that have the repo as a project.
	type Target = { repo: string; base: string; hosts: Host[] };

	let { targets, error, pickRepo = false }: { targets: Target[]; error?: string; pickRepo?: boolean } = $props();
	const MODES = [
		['approval-required', 'Ask before acting'],
		['auto-accept-edits', 'Edit freely, ask for commands'],
		['full-access', 'Full access']
	];

	let repo = $derived(targets[0]?.repo);
	const target = $derived(targets.find((t) => t.repo === repo) ?? targets[0]);
	let hostId = $derived(target?.hosts[0]?.id);
	const host = $derived(target?.hosts.find((h) => h.id === hostId) ?? target?.hosts[0]);
	const models = $derived(host?.models ?? []);
	const last = $derived(host?.last);
	let model = $derived(last && models.some((m) => `${m.instanceId}/${m.slug}` === last.model) ? last.model : `${models[0]?.instanceId}/${models[0]?.slug}`);
	const chosen = $derived(models.find((m) => `${m.instanceId}/${m.slug}` === model));
	const providers = $derived([...new Set(models.map((m) => m.provider))]);
</script>

<form
	class="new"
	method="POST"
	action="?/launch"
	use:enhance={({ formElement }) =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'redirect') formElement.reset();
		}}
>
	<textarea name="text" rows="3" placeholder="Describe a task for an agent…"></textarea>
	<input type="hidden" name="repo" value={target?.repo} />
	<input type="hidden" name="base" value={target?.base} />
	{#if pickRepo || (target?.hosts.length ?? 0) > 1}
		<div class="bar">
			{#if pickRepo}
				<select bind:value={repo} aria-label="Repository">
					{#each targets as t (t.repo)}<option value={t.repo}>{t.repo}</option>{/each}
				</select>
			{/if}
			{#if (target?.hosts.length ?? 0) > 1}
				<select name="host" bind:value={hostId} aria-label="Host">
					{#each target!.hosts as h (h.id)}<option value={h.id}>on {h.name}</option>{/each}
				</select>
			{/if}
		</div>
	{/if}
	{#if (target?.hosts.length ?? 0) <= 1}<input type="hidden" name="host" value={host?.id} />{/if}
	<div class="bar">
		<select name="model" bind:value={model} aria-label="Model">
			{#each providers as p (p)}
				<optgroup label={p}>
					{#each models.filter((m) => m.provider === p) as m (m.slug)}<option value="{m.instanceId}/{m.slug}">{m.name}</option>{/each}
				</optgroup>
			{/each}
		</select>
		{#if chosen?.reasoning}
			{@const r = chosen.reasoning}
			<input type="hidden" name="reasoningId" value={r.id} />
			{#key model}
				<select name="reasoning" aria-label="Reasoning" value={(model === last?.model && last?.reasoning) || r.options.find((o) => o.isDefault)?.id}>
					{#each r.options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
				</select>
			{/key}
		{/if}
	</div>
	<div class="bar">
		<select name="mode" aria-label="Permissions">
			{#each MODES as [value, label] (value)}<option {value}>{label}</option>{/each}
		</select>
		<button class="primary">Start</button>
	</div>
	{#if error}<p class="error">{error}</p>{/if}
</form>

<style>
	.new {
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	textarea {
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
	textarea:focus {
		outline: none;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0.75rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.bar + .bar {
		border-top: 0;
		padding-top: 0;
	}
	select {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.bar select:first-of-type {
		flex: 1;
		min-width: 0;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.85rem;
		margin: 0.4rem 0.75rem;
	}
</style>
