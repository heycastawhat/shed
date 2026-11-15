<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const err = (action: string) => (form?.action === action && 'error' in form ? form.error : undefined);
</script>

<svelte:head><title>Actions settings · {data.repo.full_name}</title></svelte:head>

<section>
	<h2>Secrets</h2>
	<p class="lead">Available to workflows as <code>{'${{ secrets.NAME }}'}</code>. Values are encrypted and can't be read back, only replaced.</p>
	<ul class="list">
		{#each data.secrets as s (s.name)}
			<li>
				<span><code>{s.name}</code> <small class="muted">added {ago(s.created_at)}</small></span>
				<form method="POST" action="?/deleteSecret" use:enhance>
					<input type="hidden" name="name" value={s.name} />
					<button class="danger">Delete</button>
				</form>
			</li>
		{:else}
			<li class="empty">No secrets yet.</li>
		{/each}
	</ul>
	<details class="add" open={!!err('secret')}>
		<summary>Add or replace a secret</summary>
		<form class="card" method="POST" action="?/secret" use:enhance>
			<label class="field">Name <input name="name" required placeholder="DEPLOY_TOKEN" autocomplete="off" /></label>
			<label class="field">Value <textarea name="value" rows="3" required autocomplete="off"></textarea></label>
			<div class="actions">
				<button class="primary">Save secret</button>
				{#if err('secret')}<p class="error" role="alert">{err('secret')}</p>{/if}
			</div>
		</form>
	</details>
</section>

<section>
	<h2>Variables</h2>
	<p class="lead">Plain values for workflows, as <code>{'${{ vars.NAME }}'}</code>.</p>
	<ul class="list">
		{#each data.variables as v (v.name)}
			<li>
				<details class="var">
					<summary><code>{v.name}</code> <span class="muted value">{v.data}</span></summary>
					<form class="inline" method="POST" action="?/variable" use:enhance>
						<input type="hidden" name="name" value={v.name} />
						<label class="field">Value <textarea name="value" rows="2">{v.data}</textarea></label>
						<div class="actions">
							<button class="primary">Save</button>
							<button class="danger" formaction="?/deleteVariable">Delete</button>
						</div>
					</form>
				</details>
			</li>
		{:else}
			<li class="empty">No variables yet.</li>
		{/each}
	</ul>
	<details class="add" open={!!err('variable')}>
		<summary>Add a variable</summary>
		<form class="card" method="POST" action="?/variable" use:enhance>
			<label class="field">Name <input name="name" required placeholder="NODE_VERSION" autocomplete="off" /></label>
			<label class="field">Value <textarea name="value" rows="2"></textarea></label>
			<div class="actions">
				<button class="primary">Save variable</button>
				{#if err('variable')}<p class="error" role="alert">{err('variable')}</p>{/if}
			</div>
		</form>
	</details>
</section>

<section>
	<h2>Runners</h2>
	<p class="lead">Machines running <code>forgejo-runner</code> that take this repo's jobs. Shared runners are set up by a Shed admin.</p>
	<ul class="list">
		{#each data.runners as r (r.id)}
			<li>
				<span class="runner">
					<span class="dot" class:on={r.online} title={r.online ? 'Online' : 'Offline'}></span>
					<strong>{r.name}</strong>
					<span class="muted">{r.scope === 'repo' ? 'this repo' : 'shared'} · {r.labels.join(', ') || 'no labels'}{r.version ? ` · ${r.version}` : ''} · {r.online ? 'online' : r.last_online ? `seen ${ago(r.last_online)}` : 'never connected'}</span>
				</span>
				{#if r.scope === 'repo'}
					<form method="POST" action="?/deleteRunner" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<button class="danger">Remove</button>
					</form>
				{/if}
			</li>
		{:else}
			<li class="empty">No runners can take this repo's jobs yet.</li>
		{/each}
	</ul>

	<form class="card register" method="POST" action="?/register" use:enhance={() => ({ update }) => update({ reset: false })}>
		<h3>Register a runner</h3>
		<div class="row">
			<label class="field">Name <input name="name" placeholder="{data.repo.name}-runner" autocomplete="off" /></label>
			<label class="field">Labels <input name="labels" placeholder="host" autocomplete="off" /><small>What <code>runs-on</code> matches, comma-separated</small></label>
		</div>
		<div class="actions"><button>Get a registration command</button></div>
		{#if form?.action === 'register' && 'command' in form}
			<p class="lead">Run this on the runner's machine; the token works once.</p>
			<pre>{form.command}</pre>
		{/if}
		{#if err('register')}<p class="error" role="alert">{err('register')}</p>{/if}
	</form>
	{#if err('deleteRunner') || err('deleteSecret') || err('deleteVariable')}<p class="error" role="alert">{err('deleteRunner') || err('deleteSecret') || err('deleteVariable')}</p>{/if}
</section>

<style>
	.add {
		margin-top: 0.75rem;
	}
	.add summary {
		color: var(--accent);
		margin-bottom: 0.5rem;
	}
	.var {
		width: 100%;
	}
	.var summary {
		display: flex;
		gap: 0.75rem;
		min-width: 0;
	}
	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.inline {
		display: grid;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}
	.runner {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.6rem;
		align-items: center;
		min-width: 0;
	}
	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--muted);
	}
	.dot.on {
		background: var(--add-fg);
	}
	.register {
		margin-top: 1rem;
	}
	.register h3 {
		margin: 0;
	}
	pre {
		margin: 0;
		padding: 0.75rem;
		border-radius: 6px;
		background: var(--surface);
		font-family: var(--mono);
		font-size: 0.85rem;
		white-space: pre-wrap;
		word-break: break-all;
		user-select: all;
	}
</style>
