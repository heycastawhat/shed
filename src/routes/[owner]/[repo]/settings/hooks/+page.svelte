<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/time.js';
	import Hook from './Hook.svelte';

	let { data, form } = $props();
	let adding = $state(false);
	const errorFor = (id: number) => (form?.action === 'save' && form.id === id ? form.error : undefined);
	const ok = (s: number | null) => s !== null && s >= 200 && s < 300;
	const pretty = (body: string) => {
		try {
			return JSON.stringify(JSON.parse(body), null, 2);
		} catch {
			return body;
		}
	};
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
						{#if form?.action === 'redeliver' && form.id === h.id && 'error' in form && form.error}<p class="error" role="alert">{form.error}</p>{/if}
						{#if h.deliveries.length}
							<ul class="deliveries">
								{#each h.deliveries as d (d.id)}
									<li>
										<details>
											<summary>
												<span class="status" class:ok={ok(d.status)}>{d.status ?? 'failed'}</span>
												<span class="event">{d.event}</span>
												<span class="response" title={d.response}>{d.response || '(empty reply)'}</span>
												<span class="muted when">{ago(d.created_at)}</span>
											</summary>
											<div class="delivery">
												{#if d.payload}
													<form method="POST" action="?/redeliver" use:enhance>
														<input type="hidden" name="id" value={h.id} />
														<input type="hidden" name="delivery" value={d.id} />
														<button>Redeliver</button>
														<small class="muted">Sends this body again, signed with the current secret</small>
													</form>
													<h4>Request headers</h4>
													<pre>{Object.entries(d.headers)
															.map(([k, v]) => `${k}: ${v}`)
															.join('\n')}</pre>
													<h4>Body</h4>
													<pre>{pretty(d.payload)}</pre>
												{:else}
													<p class="muted">Sent before Shed kept request bodies, so it can't be redelivered.</p>
												{/if}
												<h4>Response</h4>
												<pre>{d.response || '(empty reply)'}</pre>
											</div>
										</details>
									</li>
								{/each}
							</ul>
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
	.deliveries {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.85rem;
	}
	.deliveries > li {
		border-top: 1px solid var(--border);
	}
	.deliveries summary {
		display: grid;
		grid-template-columns: 3.5rem 7rem minmax(0, 1fr) 6rem;
		gap: 0.6rem;
		padding: 0.35rem 0.4rem;
		cursor: pointer;
	}
	.when {
		text-align: right;
	}
	.response {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--mono);
	}
	.delivery {
		display: grid;
		gap: 0.4rem;
		padding: 0.25rem 0.4rem 0.75rem;
		min-width: 0;
	}
	.delivery form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}
	.delivery h4 {
		margin: 0.4rem 0 0;
		font-size: 0.8rem;
	}
	.delivery pre {
		margin: 0;
		max-height: 20rem;
		overflow: auto;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		font-size: 0.78rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.status {
		font-weight: 600;
		color: var(--del-fg);
	}
	.status.ok {
		color: var(--add-fg);
	}
	@media (max-width: 700px) {
		.deliveries summary {
			grid-template-columns: 3rem 5.5rem minmax(0, 1fr);
		}
		.when {
			display: none;
		}
	}
</style>
