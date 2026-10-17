<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import Icon from '#lib/components/Icon.svelte';
	import Palette from '#lib/components/Palette.svelte';
	import { Prefs, setPrefs } from '#lib/prefs.svelte.js';
	import { themeCss } from '#lib/themes.js';
	import '../app.css';

	let { data, children } = $props();
	// Seeded from the cookies once; after that the client state is the source of truth.
	const prefs = untrack(() => new Prefs({ nav: data.nav, collapsed: data.collapsed }));
	setPrefs(prefs);

	let menu = $state<HTMLDetailsElement>();
	let pinMenu = $state<HTMLDetailsElement>();
	let mod = $state('Ctrl');
	$effect(() => {
		mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
	});

	const path = $derived(page.url.pathname);
	const NOT_REPOS = new Set(['', 'changes', 'settings', 'login', 'logout', 'auth', 'mcp', 'pin', 'prefs', 'palette.json', 'repos', 'new', 'agents']);
	const rail = $derived(prefs.nav === 'sidebar' && prefs.collapsed);

	const pinned = $derived(
		data.pins.map((name, i) => {
			const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length;
			return { name, label: name.split('/')[1], href: `/${name}`, letter: name.split('/')[1][0].toUpperCase(), color: PALETTE[hue], key: i < 9 ? String(i + 1) : '', on: path === `/${name}` || path.startsWith(`/${name}/`) };
		})
	);
	const inPinned = $derived(pinned.some((p) => p.on));
	const items = $derived([
		{ href: '/', label: 'Home', icon: 'home', chord: 'G H', on: path === '/' },
		{ href: '/changes', label: 'Changes', icon: 'changes', chord: 'G C', on: path.startsWith('/changes') },
		{ href: '/repos', label: 'Repos', icon: 'repos', chord: 'G R', add: '/new', on: !inPinned && !NOT_REPOS.has(path.split('/')[1]) || path === '/repos' || path === '/new' },
		{ href: '/agents', label: 'Agents', icon: 'agents', chord: 'G A', badge: data.waiting, on: path === '/agents' || path.startsWith('/settings/agents') }
	]);

	// Close menus whenever we navigate.
	$effect(() => {
		path;
		if (menu) menu.open = false;
		if (pinMenu) pinMenu.open = false;
	});

	const CHORDS: Record<string, string> = { h: '/', c: '/changes', r: '/repos', a: '/agents' };
	let chord = false;
	let chordTimer: ReturnType<typeof setTimeout>;

	function onkeydown(e: KeyboardEvent) {
		if (!data.user) return;
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			prefs.palette = !prefs.palette;
			return;
		}
		if (e.key === 'Escape') {
			if (menu?.open) menu.open = false;
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey || prefs.palette || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
		if (chord) {
			chord = false;
			const to = CHORDS[e.key];
			if (to) (e.preventDefault(), goto(to));
			return;
		}
		if (e.key === 'g') {
			chord = true;
			clearTimeout(chordTimer);
			chordTimer = setTimeout(() => (chord = false), 1200);
		} else if (e.key === '/') (e.preventDefault(), (prefs.palette = true));
		else if (e.key === '[' && prefs.nav === 'sidebar') prefs.save({ collapsed: !prefs.collapsed });
		else if (/^[1-9]$/.test(e.key) && pinned[+e.key - 1]) goto(pinned[+e.key - 1].href);
	}
</script>

<script lang="ts" module>
	// Tile colours for pinned repos, picked to sit with the purple accent.
	const PALETTE = ['#5b5bd6', '#8b5cf6', '#3e8fb0', '#c2703a', '#3f9a78', '#b4559a'];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>forge</title>
	{@html `<style>${themeCss}</style>`}
</svelte:head>

<svelte:window {onkeydown} onclick={(e) => [menu, pinMenu].forEach((m) => m?.open && !m.contains(e.target as Node) && (m.open = false))} />

{#snippet account()}
	<details class="menu" bind:this={menu}>
		<summary aria-label="Account menu">
			<img src={data.user!.avatar_url} alt="" />
			<span class="label">{data.user!.login}</span>
		</summary>
		<div class="panel">
			<div class="who muted">Signed in as <strong>{data.user!.login}</strong></div>
			<a class="item" href="/settings">Settings</a>
			<button class="item" onclick={() => prefs.save({ nav: prefs.nav === 'sidebar' ? 'bar' : 'sidebar' })}>
				{prefs.nav === 'sidebar' ? 'Use top bar' : 'Use sidebar'}
			</button>
			<form method="POST" action="/logout"><button class="item">Log out</button></form>
		</div>
	</details>
{/snippet}

{#snippet search()}
	<button class="search" onclick={() => (prefs.palette = true)} aria-label="Search and commands">
		<Icon name="search" />
		<span class="label">Do anything…</span>
		<kbd class="label">{mod === '⌘' ? '⌘K' : 'Ctrl K'}</kbd>
	</button>
{/snippet}

<div class="shell" class:side={data.user && prefs.nav === 'sidebar'} class:rail>
	{#if data.user && prefs.nav === 'sidebar'}
		<aside aria-label="Main">
			<a class="brand" href="/"><img src={favicon} alt="" /><span class="label">forge</span></a>
			{@render search()}
			<nav>
				{#each items as it (it.href)}
					<div class="row">
						<a href={it.href} class:on={it.on} aria-current={it.on ? 'page' : undefined} title={rail ? it.label : undefined}>
							<Icon name={it.icon} />
							<span class="label">{it.label}</span>
							{#if it.badge}<b class="badge">{it.badge}</b>{/if}
							<kbd class="chord label">{it.chord}</kbd>
						</a>
						{#if it.add}<a class="add label" href={it.add} title="New repository" aria-label="New repository"><Icon name="plus" /></a>{/if}
					</div>
				{/each}
			</nav>
			{#if pinned.length}
				<div class="group label">Pinned</div>
				<nav class="pins">
					{#each pinned as p (p.name)}
						<div class="row">
							<a href={p.href} class:on={p.on} aria-current={p.on ? 'page' : undefined} title={p.name}>
								{#if rail}<span class="tile" style:background={p.color}>{p.letter}</span>{/if}
								<span class="label"><span class="owner">{p.name.split('/')[0]}/</span>{p.label}</span>
								<kbd class="chord label">{p.key}</kbd>
							</a>
							{#if !rail}
								<form class="add" method="POST" action="/pin" use:enhance>
									<input type="hidden" name="repo" value={p.name} />
									<button title="Unpin" aria-label="Unpin {p.name}"><Icon name="unpin" size={14} /></button>
								</form>
							{/if}
						</div>
					{/each}
				</nav>
			{/if}
			<div class="foot">
				{@render account()}
				<button class="collapse" onclick={() => prefs.save({ collapsed: !prefs.collapsed })} title="{prefs.collapsed ? 'Expand' : 'Collapse'} sidebar ( [ )" aria-label="{prefs.collapsed ? 'Expand' : 'Collapse'} sidebar">
					<Icon name={prefs.collapsed ? 'right' : 'left'} />
				</button>
			</div>
		</aside>
	{:else}
		<header class="topbar">
			<div class="bar">
				<a class="brand" href="/"><img src={favicon} alt="" />forge</a>
				{#if data.user}
					<nav>
						{#each items as it (it.href)}
							<a href={it.href} class:on={it.on} aria-current={it.on ? 'page' : undefined}>
								{it.label}{#if it.badge}<b class="badge">{it.badge}</b>{/if}
							</a>
						{/each}
						{#if pinned.length}
							<details class="pinmenu" bind:this={pinMenu}>
								<summary>Pinned <Icon name="chevron" size={12} /></summary>
								<div class="panel">
									{#each pinned as p (p.name)}
										<a class="item" href={p.href}><span class="tile" style:background={p.color}>{p.letter}</span>{p.name}</a>
									{/each}
								</div>
							</details>
						{/if}
					</nav>
					<div class="tools">
						{@render search()}
						<a class="plus" href="/new" title="New repository" aria-label="New repository"><Icon name="plus" /></a>
						{@render account()}
					</div>
				{/if}
			</div>
		</header>
	{/if}

	<main>{@render children()}</main>
</div>

<Palette />

<style>
	.shell.side {
		display: grid;
		grid-template-columns: 15rem 1fr;
		min-height: 100vh;
	}
	.shell.side.rail {
		grid-template-columns: 3.75rem 1fr;
	}
	aside {
		position: sticky;
		top: 0;
		height: 100vh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.9rem 0.6rem;
		border-right: 1px solid var(--border);
		background: var(--surface);
		overflow-y: auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.1rem 0.45rem 0.7rem;
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--fg);
	}
	.brand img {
		width: 1.4rem;
		height: 1.4rem;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		margin-bottom: 0.6rem;
		padding: 0.4rem 0.55rem;
		color: var(--muted);
		background: var(--bg);
		text-align: left;
	}
	.search .label:not(kbd) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.search kbd {
		flex: none;
	}
	kbd {
		white-space: nowrap;
		padding: 0 0.35rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font: inherit;
		font-size: 0.7rem;
		color: var(--muted);
	}
	aside nav {
		display: grid;
		gap: 0.1rem;
	}
	.row {
		position: relative;
	}
	aside nav a {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.42rem 0.55rem;
		border-radius: 7px;
		color: var(--muted);
	}
	aside nav a:hover {
		background: color-mix(in srgb, var(--fg) 5%, transparent);
		color: var(--fg);
	}
	aside nav a.on {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
		color: var(--fg);
		font-weight: 500;
	}
	aside nav a.on :global(svg) {
		color: var(--accent);
	}
	.chord {
		margin-left: auto;
		border-color: transparent;
		letter-spacing: 0.05em;
	}
	.badge {
		padding: 0 0.45rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.72rem;
	}
	.add {
		position: absolute;
		right: 0.3rem;
		top: 50%;
		transform: translateY(-50%);
		display: none;
		padding: 0.2rem !important;
		background: var(--bg) !important;
	}
	form.add {
		padding: 0 !important;
		background: none !important;
	}
	form.add button {
		display: flex;
		padding: 0.2rem;
		border: 0;
		border-radius: 5px;
		background: var(--bg);
		color: var(--muted);
	}
	form.add button:hover {
		color: var(--fg);
	}
	.row:hover .add {
		display: flex;
	}
	.row:hover .chord {
		visibility: hidden;
	}
	.group {
		margin: 0.9rem 0.55rem 0.25rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.owner {
		color: var(--muted);
	}
	.tile {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 5px;
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.3rem;
		margin-top: auto;
		padding-top: 0.7rem;
		border-top: 1px solid var(--border);
	}
	.collapse {
		padding: 0.3rem;
		color: var(--muted);
		border-color: transparent;
		background: transparent;
	}
	.collapse:hover {
		color: var(--fg);
		background: var(--bg);
	}

	/* Collapsed rail: icons only. */
	.rail .label,
	.rail .group {
		display: none;
	}
	.rail aside {
		align-items: center;
		padding-inline: 0.4rem;
	}
	.rail .brand {
		padding-inline: 0;
	}
	.rail .search {
		justify-content: center;
		padding: 0.45rem;
	}
	.rail aside nav {
		width: 100%;
	}
	.rail aside nav a {
		justify-content: center;
		position: relative;
	}
	.rail .badge {
		position: absolute;
		top: 0;
		right: 0.1rem;
		padding: 0 0.3rem;
		font-size: 0.6rem;
	}
	.rail .foot {
		flex-direction: column;
		width: 100%;
	}
	.rail .menu summary {
		padding: 0.2rem;
	}

	/* Top bar mode. */
	.topbar {
		border-bottom: 1px solid var(--border);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		max-width: 960px;
		margin: 0 auto;
		padding: 0 1.5rem;
		height: 3.25rem;
	}
	.topbar .brand {
		padding: 0;
	}
	.topbar nav {
		display: flex;
		align-self: stretch;
		flex: 1;
		gap: 0.25rem;
	}
	.topbar nav > a,
	.pinmenu summary {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 0.7rem;
		color: var(--muted);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		cursor: pointer;
		list-style: none;
	}
	.pinmenu {
		position: relative;
		display: flex;
	}
	.pinmenu summary {
		height: 100%;
	}
	.pinmenu summary::-webkit-details-marker {
		display: none;
	}
	.topbar nav > a:hover,
	.pinmenu summary:hover {
		color: var(--fg);
	}
	.topbar nav > a.on {
		color: var(--fg);
		border-bottom-color: var(--accent);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.tools .search {
		width: 12rem;
		margin: 0;
	}
	.plus {
		display: grid;
		place-items: center;
		padding: 0.4rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
	}
	.plus:hover {
		background: var(--surface);
	}

	/* Account menu and dropdown panels, shared by both modes. */
	.menu {
		position: relative;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.menu summary:hover,
	.menu[open] summary {
		background: var(--bg);
	}
	.menu summary img {
		width: 24px;
		height: 24px;
		border-radius: 50%;
	}
	.panel {
		position: absolute;
		z-index: 10;
		min-width: 12rem;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
	}
	.menu .panel {
		right: 0;
		top: calc(100% + 0.35rem);
	}
	.side .menu .panel {
		right: auto;
		left: 0;
		top: auto;
		bottom: calc(100% + 0.5rem);
	}
	.pinmenu .panel {
		left: 0;
		top: calc(100% + 0.2rem);
	}
	.who {
		margin: 0.2rem 0.5rem 0.5rem;
		font-size: 0.85rem;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--fg);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.item:hover {
		background: var(--surface);
	}
	main {
		max-width: 960px;
		width: 100%;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		box-sizing: border-box;
		min-width: 0;
	}
	.side main {
		margin: 0 auto;
	}

</style>
