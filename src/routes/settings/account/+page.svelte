<script lang="ts">
	import { enhance } from '$app/forms';
	import ProfileForm from '#lib/components/ProfileForm.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const others = $derived(data.sessions.filter((s) => !s.current).length);
	// The newest few stay in view; the rest fold away, since test runs and old browsers pile up.
	const SHOWN = 5;
	const recent = $derived(data.sessions.slice(0, SHOWN));
	const older = $derived(data.sessions.slice(SHOWN));
</script>

<h1>Account</h1>

<section class="settings-card">
	<h2>Profile</h2>
	<p class="muted">What people see on <a href="/{data.me.login}">your profile</a>. You're @{data.me.login}, signed in with <a href={data.provider}>{new URL(data.provider).host}</a>; a name or picture set here stays when you sign in again.</p>
	<ProfileForm profile={data.profile} avatar={data.me.avatar_url || `/avatars/${data.me.login}.svg`} uploaded={data.uploaded} login={data.me.login} {form} />
</section>

<section class="settings-card">
	<h2>Email</h2>
	{#if data.mail && data.me.email}
		<form method="POST" action="?/emails" use:enhance class="setting-row">
			{#if !data.notifyEmail}<input type="hidden" name="on" value="1" />{/if}
			<div class="grow">
				<span class="setting-title">Notification emails</span>
				<span class="muted small">{data.notifyEmail ? 'Sent' : 'Not sent'} to {data.me.email}.</span>
			</div>
			<button class:tonal={!data.notifyEmail}>{data.notifyEmail ? 'Stop emails' : 'Email me'}</button>
		</form>
	{:else}
		<p class="muted">{data.mail ? 'Your sign-in provider gave no verified email, so notifications stay in Shed.' : "This Shed doesn't send email (no SHED_SMTP_URL), so notifications stay in Shed."}</p>
	{/if}
</section>

<section class="settings-card">
	<h2>Where you're signed in</h2>
	<p class="muted">Signing out here ends that browser's session. Agent keys aren't affected, and you stay signed in to your sign-in provider.</p>
	{#snippet row(s: (typeof data.sessions)[number])}
		<li>
			<div>
				<strong>{s.ua}</strong>
				{#if s.current}<span class="here">this browser</span>{/if}
				<span class="muted">signed in {ago(s.createdAt)}</span>
			</div>
			{#if !s.current}
				<form method="POST" action="?/end" use:enhance>
					<input type="hidden" name="id" value={s.id} />
					<button>Sign out</button>
				</form>
			{/if}
		</li>
	{/snippet}

	<ul class="settings-list">
		{#each recent as s (s.id)}{@render row(s)}{/each}
		{#if older.length}
			<li class="more">
				<details>
					<summary class="muted">Show {older.length} older session{older.length === 1 ? '' : 's'}</summary>
					<ul class="settings-list nested">
						{#each older as s (s.id)}{@render row(s)}{/each}
					</ul>
				</details>
			</li>
		{/if}
	</ul>
	{#if others}
		<form method="POST" action="?/endOthers" use:enhance>
			<button>Sign out the other {others === 1 ? 'session' : `${others} sessions`}</button>
		</form>
	{/if}
</section>

<style>
	.settings-list > li > div {
		display: block;
	}
	.settings-list li.more {
		display: block;
	}
	.more summary {
		cursor: pointer;
		font-size: 0.9rem;
	}
	.nested {
		margin-top: 0.9rem;
		padding-top: 0.9rem;
		border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
	}
	.settings-list .muted {
		margin-left: 0.5rem;
		font-size: 0.85rem;
	}
	.here {
		margin-left: 0.4rem;
		font-size: 0.75rem;
		padding: 0 0.5rem;
		border: 1px solid var(--accent);
		border-radius: 999px;
		color: var(--accent);
	}
</style>
