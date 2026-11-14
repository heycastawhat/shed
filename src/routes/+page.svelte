<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { enhance } from '$app/forms';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	let hour = $state<number | null>(null);
	let selected = $state(0);
	let list = $state<HTMLElement>();
	$effect(() => {
		hour = new Date().getHours();
	});

	const part = $derived(hour === null ? 'Hello' : hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
	const name = $derived(data.user ? data.user.full_name?.split(' ')[0] || data.user.login : '');
	const at = $derived(Math.min(selected, Math.max(data.needs.length - 1, 0)));

	const BUTTONS: Record<string, [string, string, string?]> = {
		approve: ['Approve', '?/approve', 'primary'],
		allow: ['Approve', '?/allow', 'primary'],
		deny: ['Deny', '?/deny'],
		read: ['Mark read', '?/read']
	};
	const actionsFor = (n: (typeof data.needs)[number]) => n.can.map((c) => (n.kind === 'Agent' && c === 'approve' ? 'allow' : c));

	function onkeydown(e: KeyboardEvent) {
		if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable], dialog, [role=dialog]')) return;
		const row = list?.querySelectorAll<HTMLElement>('li.need')[at];
		const click = (act: string) => row?.querySelector<HTMLElement>(`[data-act=${act}]`)?.click();
		if (e.key === 'j') selected = Math.min(at + 1, data.needs.length - 1);
		else if (e.key === 'k') selected = Math.max(at - 1, 0);
		else if (e.key === 'a') click(data.needs[at]?.kind === 'Agent' ? 'allow' : 'approve');
		else if (e.key === 'd') click('deny');
		else if (e.key === 's') click('snooze');
		else if (e.key === 'r') click('read');
		else if (e.key === 'Enter' && !(e.target as HTMLElement).closest('a, button')) row?.querySelector<HTMLElement>('a.open')?.click();
		else return;
		e.preventDefault();
		if (e.key === 'j' || e.key === 'k') queueMicrotask(() => list?.querySelectorAll('li.need')[selected]?.scrollIntoView({ block: 'nearest' }));
	}
</script>

<svelte:window {onkeydown} />

{#if !data.user}
	<section class="login">
		<h1>forge</h1>
		<a class="button primary" href="/login">Log in with Forgejo</a>
	</section>
{:else}
	<h1>{part}, {name}</h1>

	{#if data.push}
		{@const p = data.push}
		<section class="push">
			<div class="msg">
				<strong>You pushed <code>{p.branch}</code> to {p.repo} {ago(p.at)}</strong>
				<span>{p.commits === 1 ? 'One commit' : `${p.commits} commits`}. Title and description drafted from them: “{p.title}”</span>
			</div>
			<form method="POST" action="?/open" use:enhance>
				<input type="hidden" name="repo" value={p.repo} />
				<input type="hidden" name="branch" value={p.branch} />
				<button class="primary">Open change</button>
			</form>
			<form method="POST" action="?/dismiss" use:enhance>
				<input type="hidden" name="id" value={p.id} />
				<button class="x" aria-label="Dismiss">×</button>
			</form>
		</section>
	{/if}

	<section class="needs">
		<div class="bar">
			<h2>Needs you <span class="count">{data.needs.length}</span></h2>
			{#if data.needs.length}
				<span class="keys"><kbd>J</kbd><kbd>K</kbd> move · <kbd>A</kbd> approve · <kbd>D</kbd> deny · <kbd>S</kbd> snooze</span>
			{/if}
		</div>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<ul bind:this={list}>
			{#each data.needs as n, i (n.key)}
				<li class="need" class:sel={i === at} onclick={() => (selected = i)} onkeydown={() => {}} role="presentation">
					<span class="kind {n.kind}">{n.kind}</span>
					<div class="what">
						<a class="open" href={n.href}>{n.title}</a>
						<div class="muted sub">{n.sub} · {ago(n.at)}</div>
					</div>
					<div class="buttons">
						{#each actionsFor(n) as act (act)}
							{@const [label, action, cls] = BUTTONS[act]}
							<form method="POST" {action} use:enhance>
								<input type="hidden" name="id" value={n.ref.id ?? ''} />
								<input type="hidden" name="repo" value={n.ref.repo ?? ''} />
								<input type="hidden" name="number" value={n.ref.number ?? ''} />
								<button class={cls} data-act={act}>{label}</button>
							</form>
						{/each}
						<form method="POST" action="?/snooze" use:enhance>
							<input type="hidden" name="key" value={n.key} />
							<button data-act="snooze" title="Hide until tomorrow">Snooze</button>
						</form>
					</div>
				</li>
			{:else}
				<li class="clear">
					<strong>You're all caught up.</strong>
					<span class="muted">Review requests, mentions and agent approvals show up here.</span>
				</li>
			{/each}
		</ul>
	</section>

	{#if data.repos.length}
		<section class="recent">
			<h2>Recently updated <a class="all" href="/repos">All repositories</a></h2>
			<ul>
				{#each data.repos as r (r.id)}
					<li>
						<a href="/{r.full_name}">
							<span class="rname"><Icon name="repos" size={15} /><span><span class="muted">{r.owner.login}/</span>{r.name}</span></span>
							{#if r.description}<span class="desc">{r.description}</span>{/if}
							<span class="muted when">updated {ago(r.updated_at)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	.recent {
		margin-top: 2rem;
	}
	.recent h2 {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.all {
		margin-left: auto;
		font-size: 0.85rem;
		font-weight: 400;
	}
	.recent ul {
		border: 0;
		overflow: visible;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.recent li a {
		display: grid;
		align-content: start;
		gap: 0.3rem;
		height: 100%;
		box-sizing: border-box;
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--fg);
		transition: border-color 0.12s;
	}
	.recent li a:hover {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
	}
	.rname {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
	}
	.rname :global(svg) {
		color: var(--muted);
	}
	.rname .muted {
		font-weight: 400;
	}
	.desc {
		font-size: 0.88rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.when {
		font-size: 0.78rem;
	}
	.login {
		text-align: center;
		margin-top: 20vh;
	}
	h1 {
		margin: 0 0 1.25rem;
		font-size: 1.7rem;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		font-weight: 600;
	}
	.push {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 1.5rem;
		padding: 0.8rem 1rem;
		border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
		border-radius: 10px;
		background: color-mix(in srgb, var(--accent) 12%, var(--bg));
	}
	.msg {
		display: grid;
		flex: 1;
		gap: 0.15rem;
		min-width: 0;
		font-size: 0.9rem;
	}
	.msg span {
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.x {
		border-color: transparent;
		background: transparent;
		font-size: 1.2rem;
		line-height: 1;
		color: var(--muted);
	}
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.6rem;
	}
	.count {
		margin-left: 0.3rem;
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--surface);
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--muted);
	}
	.keys {
		font-size: 0.75rem;
		color: var(--muted);
	}
	kbd {
		margin-right: 0.2rem;
		padding: 0 0.35rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font: inherit;
		font-size: 0.7rem;
	}
	.error {
		color: var(--del-fg);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.need {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.75rem 1rem;
	}
	.need + .need {
		border-top: 1px solid var(--border);
	}
	.need.sel {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}
	.kind {
		flex: none;
		width: 4.6rem;
		padding: 0.1rem 0;
		border-radius: 6px;
		text-align: center;
		font-size: 0.72rem;
		font-weight: 600;
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}
	.kind.Agent {
		background: var(--accent);
		color: var(--bg);
	}
	.kind.Mention {
		background: color-mix(in srgb, var(--warn) 20%, transparent);
		color: var(--warn);
	}
	.kind.Activity {
		background: var(--surface);
		color: var(--muted);
	}
	.what {
		flex: 1;
		min-width: 0;
	}
	.open {
		color: var(--fg);
		font-weight: 600;
	}
	.open:hover {
		color: var(--accent);
	}
	.sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.82rem;
	}
	.buttons {
		display: flex;
		gap: 0.4rem;
	}
	.clear {
		display: grid;
		gap: 0.2rem;
		padding: 2rem 1rem;
		text-align: center;
	}
	@media (max-width: 700px) {
		.keys {
			display: none;
		}
		.need {
			flex-wrap: wrap;
			row-gap: 0.5rem;
		}
		.what {
			flex-basis: calc(100% - 5.5rem);
		}
		.buttons {
			flex-wrap: wrap;
			margin-left: 5.5rem;
		}
	}
</style>
