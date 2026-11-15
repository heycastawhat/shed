<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
</script>

<svelte:head><title>Admin</title></svelte:head>

<h1>Admin</h1>
<p class="muted">{data.counts.repos} repos · {data.counts.runs} CI runs</p>

<h2>Runners</h2>
<p class="muted">Runners registered here take jobs from every repo. Repo admins can also register runners for one repo in its settings.</p>
<form method="POST" action="?/token" use:enhance>
	<button>Make a registration token</button>
</form>
{#if form?.token}
	<pre class="cmd">forgejo-runner register --no-interactive --instance {page.url.origin} --token {form.token} --name &lt;name&gt; --labels docker:docker://node:20-bookworm</pre>
{/if}
{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if data.runners.length}
	<ul class="list">
		{#each data.runners as r (r.id)}
			<li>
				<div>
					<strong>{r.name}</strong> <span class="dot" class:on={r.online}></span><span class="muted small">{r.online ? 'online' : r.last_online ? `last seen ${ago(r.last_online)}` : 'never seen'}</span>
					<div class="muted small">{r.labels.join(', ') || 'no labels'} · {r.version} · {r.scope === 'global' ? 'every repo' : 'one repo'}</div>
				</div>
				<form method="POST" action="?/removeRunner" use:enhance onsubmit={(e) => confirm(`Remove ${r.name}?`) || e.preventDefault()}>
					<input type="hidden" name="id" value={r.id} />
					<button>Remove</button>
				</form>
			</li>
		{/each}
	</ul>
{:else}
	<p class="muted">No runners yet.</p>
{/if}

<h2>People</h2>
<p class="muted">Who may sign in is set by <code>SHED_ALLOWED_USERS</code>. Accounts appear here after their first sign-in or an import.</p>
<ul class="list">
	{#each data.users as u (u.id)}
		<li>
			<div>
				<a href="/{u.login}"><strong>{u.login}</strong></a>
				{#if u.name}<span class="muted">{u.name}</span>{/if}
				<div class="muted small">{u.kind === 'org' ? 'organization' : u.oidc_sub ? 'signed in' : 'imported, not signed in yet'} · since {new Date(u.created_at).toLocaleDateString('en-NZ')}</div>
			</div>
			{#if u.kind === 'user'}
				<form method="POST" action="?/admin" use:enhance>
					<input type="hidden" name="id" value={u.id} />
					{#if !u.admin}<input type="hidden" name="on" value="1" />{/if}
					<button disabled={u.id === page.data.user?.id}>{u.admin ? 'Remove admin' : 'Make admin'}</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>

<style>
	h2 {
		margin-top: 2rem;
	}
	.cmd {
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 0.85rem;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
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
	.list li > div {
		min-width: 0;
	}
	.small {
		font-size: 0.85rem;
	}
	.dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		margin: 0 0.3rem 0 0.4rem;
		background: var(--muted);
	}
	.dot.on {
		background: var(--add-fg);
	}
	.error {
		color: var(--del-fg);
	}
</style>
