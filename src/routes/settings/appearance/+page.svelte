<script lang="ts">
	import { enhance } from '$app/forms';
	import { getPrefs } from '#lib/prefs.svelte.js';
	import { THEMES } from '#lib/themes.js';

	let { data } = $props();
	const prefs = getPrefs();
	const NAV = [
		['sidebar', 'Sidebar', 'Pinned repos and shortcuts down the side. Collapses to icons with [ .'],
		['bar', 'Top bar', 'A compact bar across the top, with the full page width below.']
	] as const;
	// Drawn like Sink's layout cards: the shell, the sheet, and where things open.
	const LAYOUT = [
		['classic', 'Classic', 'Sidebar and one big sheet. Everything opens full page.'],
		['tabs', 'Tabs', 'PRs, issues, files and commits you open stay as tabs, like a browser.'],
		['split', 'Split', 'PRs and issues open beside their list, on wide screens.']
	] as const;
	let form: HTMLFormElement;
	let paletteForm: HTMLFormElement;
	const CHOICES = [
		['system', 'System', 'Follow your OS setting'],
		['light', 'Light', 'Always light'],
		['dark', 'Dark', 'Always dark']
	];

	// Apply straight away; the cookie makes the server render it the same way next time.
	function choose(theme: string) {
		if (theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = theme;
		form.requestSubmit();
	}

	function pick(palette: string) {
		if (palette === 'forge') delete document.documentElement.dataset.palette;
		else document.documentElement.dataset.palette = palette;
		paletteForm.requestSubmit();
	}
</script>

<h1>Appearance</h1>
<form bind:this={paletteForm} method="POST" action="?/palette" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: false })}>
	<fieldset class="themes">
		<legend class="muted">Theme</legend>
		{#each Object.entries(THEMES) as [id, t] (id)}
			<label class="theme">
				<input type="radio" name="palette" value={id} checked={data.palette === id} onchange={() => pick(id)} />
				<span class="preview">
					{#each [t.light, t.dark] as v, i (i)}
						<span style:background={v.bg} style:border-color={v.border}>
							<i style:background={v.surface}></i>
							<b style:background={v.fg}></b>
							<b style:background={v.muted} style:width="60%"></b>
							<em style:background={v.accent}></em>
						</span>
					{/each}
				</span>
				<strong>{t.name}</strong>
			</label>
		{/each}
	</fieldset>
</form>

<form class="mode" bind:this={form} method="POST" action="?/theme" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: false })}>
	<fieldset>
		<legend class="muted">Mode</legend>
		{#each CHOICES as [value, label, hint] (value)}
			<label class:chosen={data.theme === value}>
				<input type="radio" name="theme" {value} checked={data.theme === value} onchange={() => choose(value)} />
				<span class="swatch {value}"></span>
				<span><strong>{label}</strong><span class="muted">{hint}</span></span>
			</label>
		{/each}
	</fieldset>
</form>

<fieldset class="layouts">
	<legend class="muted">Layout</legend>
	{#each LAYOUT as [value, label, hint] (value)}
		<label class="layout">
			<input type="radio" name="layout" {value} checked={prefs.layout === value} onchange={() => prefs.save({ layout: value })} />
			<svg viewBox="0 0 120 80" aria-hidden="true">
				<rect x="4" y="4" width="24" height="72" rx="3" class="side" />
				<rect x="7" y="9" width="14" height="4" rx="2" class="ink" />
				{#each [18, 26, 34] as y (y)}<rect x="7" {y} width="17" height="4" rx="2" class="bar" />{/each}
				{#if value === 'tabs'}
					<rect x="32" y="4" width="22" height="8" rx="4" class="tab" />
					<rect x="57" y="4" width="22" height="8" rx="4" class="bar" />
					<rect x="82" y="4" width="22" height="8" rx="4" class="bar" />
				{/if}
				{#if value === 'split'}
					<rect x="32" y="4" width="84" height="72" rx="6" class="sheet" />
					{#each [0, 1, 2, 3, 4] as i (i)}<rect x="36" y={9 + i * 13} width="26" height="10" rx="3" class={i === 1 ? 'tab' : 'card'} />{/each}
					<rect x="66" y="8" width="46" height="64" rx="4" class="open" />
					<rect x="71" y="14" width="26" height="5" rx="2.5" class="ink" />
					{#each [0, 1, 2] as i (i)}<rect x="71" y={25 + i * 9} width={36 - (i % 2) * 12} height="5" rx="2.5" class="bar" />{/each}
				{:else}
					<rect x="32" y={value === 'tabs' ? 15 : 4} width="84" height={value === 'tabs' ? 61 : 72} rx="6" class="sheet" />
					<rect x="38" y={value === 'tabs' ? 21 : 11} width="40" height="5" rx="2.5" class="ink" />
					{#each [0, 1, 2, 3] as i (i)}<rect x="38" y={(value === 'tabs' ? 31 : 22) + i * 9} width={70 - (i % 2) * 18} height="5" rx="2.5" class="bar" />{/each}
				{/if}
			</svg>
			<strong>{label}</strong>
			<span class="muted">{hint}</span>
		</label>
	{/each}
</fieldset>

<fieldset class="nav">
	<legend class="muted">Navigation</legend>
	{#each NAV as [value, label, hint] (value)}
		<label>
			<input type="radio" name="nav" {value} checked={prefs.nav === value} onchange={() => prefs.save({ nav: value })} />
			<span class="swatch {value}"></span>
			<span><strong>{label}</strong><span class="muted">{hint}</span></span>
		</label>
	{/each}
</fieldset>

<style>
	fieldset {
		display: grid;
		gap: 0.6rem;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: 0.6rem;
		padding: 0;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
	}
	label:has(input:checked) {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	input {
		accent-color: var(--accent);
	}
	label span:last-child {
		display: grid;
	}
	.swatch {
		width: 2.4rem;
		height: 1.6rem;
		border: 1px solid var(--border);
		border-radius: 5px;
	}
	.swatch.light {
		background: linear-gradient(90deg, #ffffff 65%, #5b5bd6 65%);
	}
	.swatch.dark {
		background: linear-gradient(90deg, #111214 65%, #8b8bf0 65%);
	}
	.nav,
	.mode,
	.layouts {
		margin-top: 1.75rem;
	}
	.themes {
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	}
	label.theme {
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem;
	}
	.theme input {
		position: absolute;
		opacity: 0;
	}
	.theme:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.preview {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.preview > span {
		position: relative;
		display: grid;
		align-content: start;
		gap: 4px;
		height: 3.4rem;
		padding: 0.4rem 0.4rem 0 1.1rem;
		border: 1px solid;
		border-radius: 6px;
		overflow: hidden;
	}
	.preview i {
		position: absolute;
		inset: 0 auto 0 0;
		width: 0.7rem;
	}
	.preview b {
		display: block;
		height: 4px;
		border-radius: 2px;
	}
	.preview em {
		width: 1.4rem;
		height: 0.55rem;
		margin-top: 0.25rem;
		border-radius: 3px;
	}
	.layouts {
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	}
	label.layout {
		display: grid;
		gap: 0.2rem;
		align-content: start;
		padding: 0.6rem 0.6rem 0.8rem;
		border-color: transparent;
		background: color-mix(in srgb, var(--fg) 4%, var(--surface));
	}
	label.layout:hover {
		background: color-mix(in srgb, var(--fg) 7%, var(--surface));
	}
	label.layout:has(input:checked) {
		background: var(--accent-container);
	}
	.layout input {
		position: absolute;
		opacity: 0;
	}
	.layout:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.layout svg {
		width: 100%;
		margin-bottom: 0.35rem;
		border-radius: 8px;
		background: var(--shell);
	}
	.layout .muted {
		font-size: 0.82rem;
		line-height: 1.35;
	}
	.side {
		fill: color-mix(in srgb, var(--fg) 5%, transparent);
	}
	.sheet {
		fill: var(--bg);
	}
	.bar {
		fill: color-mix(in srgb, var(--fg) 13%, transparent);
	}
	.ink {
		fill: color-mix(in srgb, var(--fg) 40%, transparent);
	}
	.tab {
		fill: color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.card {
		fill: color-mix(in srgb, var(--accent) 18%, transparent);
	}
	.open {
		fill: var(--bg);
		stroke: var(--accent);
		stroke-width: 1.2;
	}
	.swatch.sidebar {
		background: linear-gradient(90deg, var(--accent) 28%, var(--surface) 28%);
	}
	.swatch.bar {
		background: linear-gradient(180deg, var(--accent) 28%, var(--surface) 28%);
	}
	.swatch.system {
		background: linear-gradient(110deg, #ffffff 50%, #111214 50%);
	}
</style>
