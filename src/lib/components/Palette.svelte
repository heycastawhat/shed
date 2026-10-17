<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getPrefs } from '#lib/prefs.svelte.js';
	import { THEMES } from '#lib/themes.js';
	import Icon from './Icon.svelte';

	const prefs = getPrefs();
	type Ref = { title: string; repo: string; number: number };
	type Found = { repos: { name: string; description: string }[]; pulls: Ref[]; issues: Ref[] };
	type Item = { label: string; hint?: string; kind: string; icon?: string; run: () => void };

	let query = $state('');
	let active = $state(0);
	let found = $state<Found>({ repos: [], pulls: [], issues: [] });
	let loaded = false;


	const go = (href: string) => () => goto(href);

	async function setTheme(theme: 'system' | 'light' | 'dark') {
		if (theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = theme;
		await fetch('/settings/appearance?/theme', { method: 'POST', body: new URLSearchParams({ theme }), headers: { 'x-sveltekit-action': 'true' } });
	}

	async function setPalette(palette: string) {
		if (palette === 'forge') delete document.documentElement.dataset.palette;
		else document.documentElement.dataset.palette = palette;
		await fetch('/settings/appearance?/palette', { method: 'POST', body: new URLSearchParams({ palette }), headers: { 'x-sveltekit-action': 'true' } });
	}

	const all = $derived.by((): Item[] => {
		const d = page.data;
		const pinned = (d.pins ?? []).map((r: string): Item => ({ label: r, hint: 'Pinned', kind: 'Repo', icon: 'pin', run: go(`/${r}`) }));
		const rest = found.repos.filter((r) => !(d.pins ?? []).includes(r.name)).map((r): Item => ({ label: r.name, hint: r.description, kind: 'Repo', icon: 'repos', run: go(`/${r.name}`) }));
		return [
			{ label: 'Home', kind: 'Page', icon: 'home', hint: 'G H', run: go('/') },
			{ label: 'Changes', kind: 'Page', icon: 'changes', hint: 'G C', run: go('/changes') },
			{ label: 'Repositories', kind: 'Page', icon: 'repos', hint: 'G R', run: go('/repos') },
			{ label: 'Agents', kind: 'Page', icon: 'agents', hint: 'G A', run: go('/agents') },
			{ label: 'Agent keys', kind: 'Page', icon: 'agents', run: go('/settings/agents') },
			{ label: 'Settings', kind: 'Page', icon: 'sliders', run: go('/settings/account') },
			{ label: 'New repository', kind: 'Action', icon: 'plus', run: go('/new') },
			...(d.waiting ? [{ label: `Review ${d.waiting} waiting agent request${d.waiting === 1 ? '' : 's'}`, kind: 'Action', icon: 'clock', run: go('/agents') }] : []),
			{ label: prefs.nav === 'sidebar' ? 'Switch to top bar' : 'Switch to sidebar', kind: 'Action', icon: 'layout', run: () => prefs.save({ nav: prefs.nav === 'sidebar' ? 'bar' : 'sidebar' }) },
			...(prefs.nav === 'sidebar' ? [{ label: prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar', kind: 'Action', icon: 'layout', hint: '[', run: () => prefs.save({ collapsed: !prefs.collapsed }) }] : []),
			{ label: 'Mode: light', kind: 'Action', icon: 'sun', run: () => setTheme('light') },
			{ label: 'Mode: dark', kind: 'Action', icon: 'moon', run: () => setTheme('dark') },
			{ label: 'Mode: follow system', kind: 'Action', icon: 'monitor', run: () => setTheme('system') },
			...Object.entries(THEMES).map(([id, t]): Item => ({ label: `Theme: ${t.name}`, kind: 'Action', icon: 'palette', run: () => setPalette(id) })),
			...pinned,
			...found.pulls.map((p): Item => ({ label: p.title, hint: `${p.repo} #${p.number}`, kind: 'PR', icon: 'changes', run: go(`/${p.repo}/pulls/${p.number}`) })),
			...found.issues.map((i): Item => ({ label: i.title, hint: `${i.repo} #${i.number}`, kind: 'Issue', icon: 'issue', run: go(`/${i.repo}/issues/${i.number}`) })),
			...rest
		];
	});

	// Every word must appear; earlier and word-start matches rank higher.
	const results = $derived.by(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return all.slice(0, 12);
		return all
			.map((it) => {
				const text = `${it.label} ${it.hint ?? ''} ${it.kind}`.toLowerCase();
				const at = words.map((w) => text.indexOf(w));
				const label = it.label.toLowerCase();
				return { it, score: at.includes(-1) ? -1 : (words.every((w) => label.startsWith(w) || label.includes(` ${w}`)) ? 0 : 50) + Math.min(...at) };
			})
			.filter((r) => r.score >= 0)
			.sort((a, b) => a.score - b.score)
			.map((r) => r.it)
			.slice(0, 12);
	});

	$effect(() => {
		if (!prefs.palette) return;
		query = '';
		active = 0;
		if (!loaded) {
			loaded = true;
			fetch('/palette.json').then((r) => (r.ok ? r.json() : null)).then((j) => j && (found = j), () => (loaded = false));
		}
	});

	$effect(() => {
		query;
		active = 0;
	});

	function pick(item: Item | undefined) {
		if (!item) return;
		prefs.palette = false;
		item.run();
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') prefs.palette = false;
		else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) (e.preventDefault(), (active = (active + 1) % Math.max(results.length, 1)));
		else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) (e.preventDefault(), (active = (active - 1 + results.length) % Math.max(results.length, 1)));
		else if (e.key === 'Enter') (e.preventDefault(), pick(results[active]));
	}
</script>

{#if prefs.palette}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (prefs.palette = false)}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<div class="field">
				<Icon name="search" />
				<input bind:value={query} onkeydown={onkey} placeholder="Do anything…" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list" {@attach (el) => el.focus()} />
				<kbd>esc</kbd>
			</div>
			<ul id="palette-list" role="listbox">
				{#each results as item, i (item.kind + item.label + (item.hint ?? ''))}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li role="option" aria-selected={i === active} class:active={i === active} onmousemove={() => (active = i)} onclick={() => pick(item)}>
						<span class="kind" title={item.kind}><Icon name={item.icon ?? 'right'} size={15} /></span>
						<span class="label">{item.label}</span>
						{#if item.hint}<span class="hint">{item.hint}</span>{/if}
					</li>
				{:else}
					<li class="none">Nothing matches “{query}”</li>
				{/each}
			</ul>
			<div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span></div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 14vh;
		background: rgb(0 0 0 / 0.45);
	}
	.dialog {
		width: min(38rem, calc(100vw - 2rem));
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		box-shadow: 0 20px 60px rgb(0 0 0 / 0.4);
		overflow: hidden;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--border);
		color: var(--muted);
	}
	input {
		flex: 1;
		font: inherit;
		font-size: 1.05rem;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--fg);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0.4rem;
		max-height: 22rem;
		overflow-y: auto;
	}
	li {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		padding: 0.5rem 0.7rem;
		border-radius: 8px;
		cursor: pointer;
	}
	li.active {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.kind {
		display: flex;
		flex: none;
		color: var(--muted);
	}
	li.active .kind {
		color: var(--accent);
	}
	.label {
		flex: none;
		max-width: 60%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: right;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.none {
		cursor: default;
		color: var(--muted);
	}
	.foot {
		display: flex;
		gap: 1rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--muted);
	}
	kbd {
		margin-right: 0.25rem;
		padding: 0 0.35rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--surface);
		font: inherit;
		font-size: 0.7rem;
		color: var(--muted);
	}
</style>
