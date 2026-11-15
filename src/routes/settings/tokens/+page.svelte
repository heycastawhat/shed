<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const host = $derived(page.url.host);
</script>

<svelte:head><title>Tokens</title></svelte:head>

<h1>Tokens</h1>
<p class="muted">For git over HTTPS and scripts. Use one as the password when git asks; the username can be anything.</p>

{#if form?.token}
	<section class="new" role="status">
		<strong>Copy this token now. It won't be shown again.</strong>
		<code class="token">{form.token}</code>
		<p class="muted">Paste it as the password when git asks, e.g. after <code>git clone https://{host}/{data.login}/&lt;repo&gt;.git</code>. A credential helper (<code>git config --global credential.helper store</code>) saves it.</p>
	</section>
{/if}

<section class="settings-card">
	<h2>New token</h2>
	<form class="settings-form" method="POST" action="?/create" use:enhance>
		<label>Name <input name="name" required placeholder="laptop" /></label>
		<fieldset>
			<legend>Can</legend>
			<label class="check"><input type="checkbox" name="scope" value="repo:read" checked /> Read repos (clone, fetch)</label>
			<label class="check"><input type="checkbox" name="scope" value="repo:write" /> Write repos (push)</label>
		</fieldset>
		<label>Only these repos <input name="repos" placeholder="all repos, or e.g. ada/sample kiwi/website" /></label>
		<label
			>Expires
			<select name="days">
				<option value="30">in 30 days</option>
				<option value="90">in 90 days</option>
				<option value="365">in a year</option>
				<option value="0">never</option>
			</select>
		</label>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<button class="primary">Create token</button>
	</form>
</section>

{#if data.tokens.length}
<section class="settings-card">
		<h2>Your tokens</h2>
		<ul class="settings-list">
			{#each data.tokens as t (t.id)}
				<li>
					<div>
						<strong>{t.name}</strong>
						<span class="muted">{t.scopes.map((s) => (s === 'repo:write' ? 'push' : 'clone')).join(' + ')} · {t.repos.includes('*') ? 'all repos' : t.repos.join(', ')}</span>
						<div class="muted small">
							created {ago(t.created_at)} · {t.last_used_at ? `last used ${ago(t.last_used_at)}` : 'never used'}
							{#if t.expires_at}· {Date.parse(t.expires_at) < Date.now() ? 'expired' : `expires ${new Date(t.expires_at).toLocaleDateString('en-NZ')}`}{/if}
						</div>
					</div>
					<form method="POST" action="?/revoke" use:enhance>
						<input type="hidden" name="id" value={t.id} />
						<button>Revoke</button>
					</form>
				</li>
			{/each}
		</ul>
</section>
{/if}

<style>
	.new {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
	}
	.token {
		font-size: 0.95rem;
		word-break: break-all;
		user-select: all;
	}
	.new code {
		word-break: break-all;
	}
	input:not([type='checkbox']),
	select {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	input:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.3rem;
	}
	legend {
		margin-bottom: 0.3rem;
	}
	.error {
		color: var(--del-fg);
	}
</style>
