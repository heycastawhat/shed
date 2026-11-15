<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
</script>

<svelte:head><title>SSH keys</title></svelte:head>

<h1>SSH keys</h1>
<p class="muted">For git over SSH. Add the public half of a key (the <code>.pub</code> file), then clone with the SSH address on any repo's page, e.g. <code>git clone ssh://git@{page.url.hostname}:2222/owner/repo.git</code>.</p>

<form class="add" method="POST" action="?/add" use:enhance>
	<label>Name <input name="title" placeholder="laptop" /></label>
	<label>Public key <textarea name="key" rows="4" required placeholder="ssh-ed25519 AAAA… you@laptop"></textarea></label>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	<button class="primary">Add key</button>
</form>

{#if data.keys.length}
	<ul class="list">
		{#each data.keys as k (k.id)}
			<li>
				<div>
					<strong>{k.title}</strong>
					<code class="muted">{k.fingerprint}</code>
					<span class="muted small">added {ago(k.created_at)} · {k.last_used_at ? `last used ${ago(k.last_used_at)}` : 'never used'}</span>
				</div>
				<form method="POST" action="?/remove" use:enhance>
					<input type="hidden" name="id" value={k.id} />
					<button>Remove</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.add {
		display: grid;
		gap: 0.9rem;
		max-width: 36rem;
		margin-bottom: 2rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
	}
	input,
	textarea {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	textarea {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
	}
	input:focus-visible,
	textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	.add button {
		justify-self: start;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list li > div {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	code {
		word-break: break-all;
	}
	.small {
		font-size: 0.85rem;
	}
	.error {
		color: var(--del-fg);
	}
</style>
