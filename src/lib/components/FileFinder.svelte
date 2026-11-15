<script lang="ts">
	import { goto } from '$app/navigation';
	import { rank } from '#lib/fuzzy.js';
	import { getPrefs } from '#lib/prefs.svelte.js';
	import { refPath } from '#lib/repo.js';
	import Icon from './Icon.svelte';

	let { repo, ref }: { repo: string; ref: string } = $props();
	const prefs = getPrefs();
	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let paths = $state<string[] | null>(null);
	let failed = $state('');
	let loadedFor = '';
	let list = $state<HTMLUListElement>();

	const results = $derived(paths ? rank(query, paths) : []);

	function show() {
		open = true;
		query = '';
		active = 0;
		const key = `${repo}@${ref}`;
		if (loadedFor === key) return;
		loadedFor = key;
		paths = null;
		failed = '';
		fetch(`/${repo}/files/${encodeURIComponent(ref)}`)
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
			.then((p: string[]) => loadedFor === key && (paths = p))
			.catch(() => ((failed = "Couldn't load the file list"), (loadedFor = '')));
	}

	$effect(() => {
		addEventListener('gotofile', show);
		return () => removeEventListener('gotofile', show);
	});

	$effect(() => {
		query;
		active = 0;
	});

	$effect(() => {
		list?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
	});

	function pick(path: string | undefined) {
		if (!path) return;
		open = false;
		goto(`/${repo}/blob/${refPath(ref, path)}`);
	}

	function onwindowkey(e: KeyboardEvent) {
		if (open || e.key !== 't' || e.ctrlKey || e.metaKey || e.altKey || prefs.palette) return;
		if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
		e.preventDefault();
		show();
	}

	function onkey(e: KeyboardEvent) {
		const n = Math.max(results.length, 1);
		if (e.key === 'Escape') open = false;
		else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) (e.preventDefault(), (active = (active + 1) % n));
		else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) (e.preventDefault(), (active = (active - 1 + n) % n));
		else if (e.key === 'Enter') (e.preventDefault(), pick(results[active]?.path));
	}

	// The path split into plain and matched runs, for highlighting.
	function parts(path: string, hits: number[]) {
		const set = new Set(hits);
		const out: { text: string; hit: boolean }[] = [];
		for (let i = 0; i < path.length; i++) {
			const hit = set.has(i);
			if (out.at(-1)?.hit === hit) out.at(-1)!.text += path[i];
			else out.push({ text: path[i], hit });
		}
		return out;
	}
</script>

<svelte:window onkeydown={onwindowkey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (open = false)}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label="Go to file" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<div class="field">
				<Icon name="file" />
				<input bind:value={query} onkeydown={onkey} placeholder="Go to file in {ref}…" aria-label="File name" role="combobox" aria-expanded="true" aria-controls="finder-list" {@attach (el) => el.focus()} />
				<kbd>esc</kbd>
			</div>
			<ul id="finder-list" role="listbox" bind:this={list}>
				{#if failed}
					<li class="none">{failed}</li>
				{:else if !paths}
					<li class="none">Loading files…</li>
				{:else}
					{#each results as r, i (r.path)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<li role="option" aria-selected={i === active} class:active={i === active} onmousemove={() => (active = i)} onclick={() => pick(r.path)}>
							<span class="kind"><Icon name="file" size={15} /></span>
							<span class="label">{#each parts(r.path, r.hits) as p, j (j)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
						</li>
					{:else}
						<li class="none">{paths.length ? `No file matches “${query}”` : 'No files here'}</li>
					{/each}
				{/if}
			</ul>
			<div class="foot">
				<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span>
				{#if paths}<span class="count">{paths.length} file{paths.length === 1 ? '' : 's'}</span>{/if}
			</div>
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
		min-width: 0;
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
		align-self: center;
		color: var(--muted);
	}
	li.active .kind {
		color: var(--accent);
	}
	.label {
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--mono);
		font-size: 0.88rem;
	}
	mark {
		background: none;
		color: var(--accent);
		font-weight: 700;
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
	.count {
		margin-left: auto;
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
