<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import Pager from '#lib/components/Pager.svelte';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const unread = $derived(data.groups.some((g) => g.notes.some((n) => n.unread)));
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const icon = (n: { subject: { type: string; state: string } }) =>
		n.subject.type === 'Pull' ? (n.subject.state === 'merged' ? 'merge' : 'changes') : n.subject.state === 'closed' ? 'done' : 'issue';
</script>

<svelte:head><title>Notifications</title></svelte:head>

<div class="top">
	<h1>Notifications</h1>
	<div class="filters">
		<a href="?" class:on={!data.all}><Icon name="bell" size={14} />Unread</a>
		<a href="?tab=all" class:on={data.all}><Icon name="inbox" size={14} />All</a>
	</div>
	{#if unread}
		<form method="POST" action="?/all" use:enhance={keep}>
			<button><Icon name="check" size={14} />Mark all read</button>
		</form>
	{/if}
</div>
{#if form?.error}<p class="error">{form.error}</p>{/if}

{#each data.groups as g (g.repo)}
	<section>
		<h2><a href="/{g.repo}">{g.repo}</a></h2>
		<ul>
			{#each g.notes as n (n.id)}
				<li class:unread={n.unread}>
					<span class="kind {n.subject.state}"><Icon name={icon(n)} size={16} /></span>
					<a class="title" href="/notifications/{n.id}" data-sveltekit-reload>
						<strong>{n.subject.title}</strong>
						<span class="muted">#{n.number} · {n.subject.type === 'Pull' ? 'Pull request' : 'Issue'} · {ago(n.updated_at)}</span>
					</a>
					{#if n.unread}<span class="dot" title="Unread"></span>{/if}
					{#if n.pinned}<span class="pin" title="Pinned"><Icon name="pin" size={14} /></span>{/if}
					<div class="tools">
						<form method="POST" action="?/mark" use:enhance={keep}>
							<input type="hidden" name="id" value={n.id} />
							<input type="hidden" name="to" value={n.unread ? 'read' : 'unread'} />
							<button title={n.unread ? 'Mark as read' : 'Mark as unread'} aria-label={n.unread ? 'Mark as read' : 'Mark as unread'}><Icon name={n.unread ? 'read' : 'bell'} size={15} /></button>
						</form>
						<form method="POST" action="?/mark" use:enhance={keep}>
							<input type="hidden" name="id" value={n.id} />
							<input type="hidden" name="to" value={n.pinned ? 'read' : 'pinned'} />
							<button title={n.pinned ? 'Unpin' : 'Pin'} aria-label={n.pinned ? 'Unpin' : 'Pin'}><Icon name={n.pinned ? 'unpin' : 'pin'} size={15} /></button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<div class="empty">
		<Icon name="bell" size={28} />
		<strong>{data.all ? 'No notifications yet' : "You're all caught up"}</strong>
		<span class="muted">Activity on issues and pull requests you're part of, or repos you watch, shows up here.</span>
	</div>
{/each}

<Pager page={data.page} total={data.total} size={50} />

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	h1 {
		margin: 0 auto 0 0;
		font-size: 1.4rem;
	}
	.top button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.filters {
		display: inline-flex;
		gap: 0.2rem;
		padding: 0.2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.filters a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.7rem;
		border-radius: 6px;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.filters a.on {
		background: var(--bg);
		color: var(--fg);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
	}
	section {
		margin-bottom: 1.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	h2 {
		margin: 0;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}
	h2 a {
		color: var(--fg);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li:hover {
		background: color-mix(in srgb, var(--fg) 4%, transparent);
	}
	.kind {
		color: var(--accent);
	}
	.kind.closed {
		color: var(--del-fg);
	}
	.title {
		display: grid;
		flex: 1;
		min-width: 0;
		color: var(--fg);
	}
	.title strong {
		font-weight: 400;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.unread .title strong {
		font-weight: 600;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	.title .muted {
		font-size: 0.8rem;
	}
	.pin {
		color: var(--accent);
	}
	.tools {
		display: flex;
		gap: 0.15rem;
	}
	.tools button {
		display: grid;
		place-items: center;
		padding: 0.3rem;
		border-color: transparent;
		background: none;
		color: var(--muted);
	}
	.tools button:hover {
		color: var(--accent);
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.empty {
		display: grid;
		justify-items: center;
		gap: 0.4rem;
		padding: 3rem 1rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		text-align: center;
	}
	.error {
		color: var(--del-fg);
	}
</style>
