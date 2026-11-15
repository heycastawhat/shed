<script lang="ts">
	import { enhance } from '$app/forms';
	import ProfileForm from '#lib/components/ProfileForm.svelte';

	let { data, form } = $props();
	const o = $derived(data.org);
	const owners = $derived(data.members.filter((m) => m.role === 'owner').length);
	const msg = (action: string) => (form?.action === action ? form : null);
	let confirm = $state('');
	const keep = () => ({ update }: { update: (o?: { reset: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>Settings · {o.username}</title></svelte:head>

<header>
	<img src={o.avatar_url} alt="" />
	<h1><a href="/{o.username}">{o.full_name || o.username}</a> <span class="muted">/ Settings</span></h1>
</header>

<section class="settings-card">
	<h2>Profile</h2>
	<p class="muted">What people see on the organization's page.</p>
	<ProfileForm profile={o} avatar={o.avatar_url} uploaded={/^\/avatars\/\d+\.img/.test(o.avatar_url)} login={o.username} org {form} />
</section>

<section class="settings-card">
	<h2>Members</h2>
	<p class="muted">Members can push to every repository the organization owns. Owners administer them and run these settings.</p>
	<form class="add" method="POST" action="?/member" use:enhance>
		<label class="field">Login <input name="login" required autocomplete="off" placeholder="someone" /></label>
		<label class="field"
			>Role
			<select name="role"><option value="member">Member</option><option value="owner">Owner</option></select>
		</label>
		<button class="primary">Add</button>
	</form>
	{#if msg('member')?.error}<p class="error" role="alert">{msg('member')?.error}</p>{/if}
	<ul class="settings-list">
		{#each data.members as m (m.id)}
			{@const me = m.id === data.user?.id}
			<li>
				<a class="who" href="/{m.login}"><img src={m.avatar_url} alt="" /><strong>{m.full_name || m.login}</strong>{#if m.full_name}<span class="muted">{m.login}</span>{/if}</a>
				<span class="tag" class:owner={m.role === 'owner'}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
				<div class="buttons">
					<form method="POST" action="?/member" use:enhance>
						<input type="hidden" name="login" value={m.login} />
						<input type="hidden" name="role" value={m.role === 'owner' ? 'member' : 'owner'} />
						<button disabled={m.role === 'owner' && owners === 1} title={m.role === 'owner' && owners === 1 ? 'The organization needs an owner' : undefined}
							>{m.role === 'owner' ? 'Make member' : 'Make owner'}</button
						>
					</form>
					<form method="POST" action="?/remove" use:enhance>
						<input type="hidden" name="login" value={m.login} />
						<button class="danger" disabled={m.role === 'owner' && owners === 1}>{me ? 'Leave' : 'Remove'}</button>
					</form>
				</div>
			</li>
		{/each}
	</ul>
</section>

<section class="settings-card danger-card">
	<h2>Danger zone</h2>
	<form class="danger-zone" method="POST" action="?/delete" use:enhance={keep}>
		<h3>Delete this organization</h3>
		{#if data.repos}
			<p class="muted">It still owns {data.repos} repositor{data.repos === 1 ? 'y' : 'ies'}. Transfer or delete {data.repos === 1 ? 'it' : 'them'} first, from each repository's settings.</p>
		{:else}
			<p class="muted">Removes the organization and its memberships. Its name becomes free for anyone to take.</p>
			<div class="row">
				<label class="field"><span>Type <strong>{o.username}</strong> to confirm</span><input name="confirm" bind:value={confirm} autocomplete="off" /></label>
				<button class="danger" disabled={confirm.trim().toLowerCase() !== o.username.toLowerCase()}>Delete organization</button>
			</div>
		{/if}
		{#if msg('delete')?.error}<p class="error" role="alert">{msg('delete')?.error}</p>{/if}
	</form>
</section>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	header img {
		width: 40px;
		height: 40px;
		border-radius: var(--radius);
	}
	h1 {
		margin: 0;
		font-size: 1.4rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	h1 a {
		color: var(--fg);
	}
	h1 .muted {
		font-weight: 400;
	}
	section {
		max-width: 48rem;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
	}
	.field {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	input,
	select {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	.add,
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem;
	}
	.add .field:first-child,
	.row .field {
		flex: 1 1 12rem;
	}
	.settings-list li {
		flex-wrap: wrap;
		justify-content: start;
		gap: 0.5rem 0.75rem;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		color: var(--fg);
	}
	.who img {
		width: 28px;
		height: 28px;
		border-radius: 50%;
	}
	.tag.owner {
		border-color: var(--accent);
		color: var(--accent);
	}
	.buttons {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}
	.danger-card {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--del-fg) 45%, transparent);
	}
	.danger-zone {
		display: grid;
		gap: 0.5rem;
	}
	.error {
		margin: 0 0 0.75rem;
		color: var(--del-fg);
	}
	.danger-zone .error {
		margin: 0;
	}
	button.danger {
		color: var(--del-fg);
	}
	button.danger:hover:not(:disabled) {
		border-color: var(--del-fg);
	}
</style>
