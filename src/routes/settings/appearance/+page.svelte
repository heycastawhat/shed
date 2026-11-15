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
	.mode {
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
