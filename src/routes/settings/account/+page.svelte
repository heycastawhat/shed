<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const others = $derived(data.sessions.filter((s) => !s.current).length);
	// The newest few stay in view; the rest fold away, since test runs and old browsers pile up.
	const SHOWN = 5;
	const recent = $derived(data.sessions.slice(0, SHOWN));
	const older = $derived(data.sessions.slice(SHOWN));
</script>

<h1>Account</h1>

<section class="me">
	{#if data.me.avatar_url}<img src={data.me.avatar_url} alt="" />{/if}
	<div>
		<strong>{data.me.name || data.me.login}</strong>
		<div class="muted">@{data.me.login}, signed in with <a href={data.provider}>{new URL(data.provider).host}</a></div>
	</div>
	<a class="button" href={data.provider}>Edit profile there</a>
</section>

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

<ul class="list">
	{#each recent as s (s.id)}{@render row(s)}{/each}
	{#if older.length}
		<li class="more">
			<details>
				<summary class="muted">Show {older.length} older session{older.length === 1 ? '' : 's'}</summary>
				<ul class="list nested">
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

<style>
	.me {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.me img {
		width: 48px;
		height: 48px;
		border-radius: 50%;
	}
	.me div {
		flex: 1;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
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
	.list li.more {
		display: block;
		padding: 0;
	}
	.more summary {
		padding: 0.6rem 1rem;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.nested {
		margin: 0;
		border: 0;
		border-top: 1px solid var(--border);
		border-radius: 0;
	}
	.list .muted {
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
