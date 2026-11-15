<script lang="ts" module>
	export type Sel = { from: number; to: number };
	export const parseSel = (hash: string): Sel | null => {
		const m = hash.match(/^#L(\d+)(?:-L?(\d+))?$/);
		if (!m) return null;
		const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
		return { from: Math.min(a, b), to: Math.max(a, b) };
	};
	export const selHash = (s: Sel) => (s.from === s.to ? `#L${s.from}` : `#L${s.from}-L${s.to}`);
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';

	// `gutter` renders the blame cell for line `n` when a range starts there (it spans `rows`).
	let { html, gutter }: { html: string[]; gutter?: { at: Record<number, number>; cell: Snippet<[number]> } } = $props();
	let sel = $state<Sel | null>(null);
	let anchor = 0;

	function fromHash() {
		const s = parseSel(location.hash);
		sel = s;
		anchor = s?.from ?? 0;
		if (s) document.getElementById(`L${s.from}`)?.scrollIntoView({ block: 'center' });
	}

	$effect(() => {
		fromHash();
		const on = () => fromHash();
		addEventListener('hashchange', on);
		return () => removeEventListener('hashchange', on);
	});

	function pick(e: MouseEvent, n: number) {
		e.preventDefault();
		if (e.shiftKey && anchor) sel = { from: Math.min(anchor, n), to: Math.max(anchor, n) };
		else (sel = { from: n, to: n }), (anchor = n);
		replaceState(selHash(sel), page.state);
	}
</script>

<div class="shiki lines">
	<table>
		<tbody>
			{#each html as line, i (i)}
				{@const n = i + 1}
				<tr id="L{n}" class:hl={sel && n >= sel.from && n <= sel.to} class:start={gutter && gutter.at[n] && n > 1}>
					{#if gutter && gutter.at[n]}<td class="blame" rowspan={gutter.at[n]}>{@render gutter.cell(n)}</td>{/if}
					<td class="num"><a href="#L{n}" onclick={(e) => pick(e, n)}>{n}</a></td>
					<td class="src">{@html line || ' '}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.lines {
		padding: 0.5rem 0;
		overflow-x: auto;
		font-size: 0.85rem;
	}
	table {
		border-collapse: collapse;
		min-width: 100%;
		font-family: var(--mono);
		line-height: 1.5;
	}
	td {
		padding: 0;
		vertical-align: top;
	}
	.num {
		width: 1%;
		padding: 0 1rem 0 0.75rem;
		text-align: right;
		user-select: none;
	}
	.num a {
		color: var(--muted);
	}
	.num a:hover {
		color: var(--fg);
	}
	.src {
		padding-right: 1rem;
		white-space: pre;
	}
	tr.hl td.num,
	tr.hl td.src {
		background: color-mix(in srgb, var(--warn) 14%, transparent);
	}
	tr.hl .num a {
		color: var(--fg);
	}
	tr {
		scroll-margin-top: 4rem;
	}
	tr.start td {
		border-top: 1px solid var(--border);
	}
	.blame {
		width: 1%;
		max-width: 22rem;
		padding: 0.15rem 0.75rem;
		border-right: 1px solid var(--border);
		font-family: system-ui, sans-serif;
		font-size: 0.8rem;
	}
</style>
