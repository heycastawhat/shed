<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/time.js';
	import Hook from './Hook.svelte';

	let { data, form } = $props();
	let adding = $state(false);
	const errorFor = (id: number) => (form?.action === 'save' && form.id === id ? form.error : undefined);
	const ok = (s: number | null) => s !== null && s >= 200 && s < 300;
</script>

<svelte:head><title>Webhooks · {data.repo.full_name}</title></svelte:head>

<section>
	<div class="title">
		<div>
			<h2>Webhooks</h2>
			<p class="lead">Shed tells these URLs when things happen, with the same headers and payloads as Forgejo (and GitHub's event names).</p>
		</div>
		{#if !adding}<button class="primary" onclick={() => (adding = true)}>Add webhook</button>{/if}
	</div>

	{#if adding}
		<div class="card new">
			<h3>New webhook</h3>
			<Hook events={data.events} error={errorFor(0)} onsaved={() => (adding = false)} />
			<button class="cancel" onclick={() => (adding = false)}>Cancel</button>
		</div>
	{/if}

	<ul class="list">
		{#each data.hooks as h (h.id)}
			{@const last = h.deliveries[0]}
			<li>
				<details open={!!errorFor(h.id) || (form?.action === 'test' && form.id === h.id)}>
					<summary>
						<span class="dot" class:ok={last && ok(last.status)} class:bad={last && !ok(last.status)} title={last ? `Last delivery: ${last.status ?? 'failed'}` : 'Not delivered yet'}></span>
						<span class="url">{h.url}</span>
						<span class="muted">{h.events.join(', ')}{h.active ? '' : ' · inactive'}</span>
					</summary>
					<div class="edit">
						<Hook hook={h} events={data.events} error={errorFor(h.id)} />
						<div class="actions">
							<form method="POST" action="?/test" use:enhance>
								<input type="hidden" name="id" value={h.id} />
								<button>Send a test push</button>
							</form>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={h.id} />
								<button class="danger">Delete webhook</button>
							</form>
						</div>
						{#if form?.action === 'test' && 'error' in form && form.error}<p class="error" role="alert">{form.error}</p>{/if}
						<h3>Recent deliveries</h3>
						{#if h.deliveries.length}
							<table>
								<tbody>
									{#each h.deliveries as d (d.id)}
										<tr>
											<td><span class="status" class:ok={ok(d.status)}>{d.status ?? 'failed'}</span></td>
											<td>{d.event}</td>
											<td class="response" title={d.response}>{d.response || '(empty reply)'}</td>
											<td class="muted when">{ago(d.created_at)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<p class="lead">Nothing sent yet.</p>
						{/if}
					</div>
				</details>
			</li>
		{:else}
			<li class="empty">No webhooks.</li>
		{/each}
	</ul>
	{#if form?.action === 'delete' && form.error}<p class="error" role="alert">{form.error}</p>{/if}
</section>

<style>
	.title {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 1rem;
	}
	.title button {
		flex: none;
	}
	.new {
		margin-bottom: 1rem;
	}
	.cancel {
		justify-self: start;
	}
	details {
		width: 100%;
		min-width: 0;
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.6rem;
		align-items: center;
	}
	.url {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--muted);
		flex: none;
	}
	.dot.ok {
		background: var(--add-fg);
	}
	.dot.bad {
		background: var(--del-fg);
	}
	.edit {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		min-width: 0;
	}
	.edit h3 {
		margin: 0.5rem 0 0;
	}
	table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	td {
		padding: 0.3rem 0.4rem;
		border-top: 1px solid var(--border);
		vertical-align: top;
	}
	td:first-child {
		width: 4.5rem;
	}
	td:nth-child(2) {
		width: 7rem;
	}
	.when {
		width: 6rem;
		text-align: right;
	}
	.response {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--mono);
	}
	.status {
		font-weight: 600;
		color: var(--del-fg);
	}
	.status.ok {
		color: var(--add-fg);
	}
	@media (max-width: 700px) {
		td:nth-child(2) {
			width: 5.5rem;
		}
		.when {
			display: none;
		}
	}
</style>
