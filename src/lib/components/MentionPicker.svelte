<script lang="ts">
	import { page } from '$app/state';

	type Person = { login: string; full_name: string; avatar_url?: string };
	let { input }: { input: HTMLTextAreaElement | undefined } = $props();

	const AGENT: Person = { login: 'agent', full_name: 'Start a T3 Code task' };
	const cache = new Map<string, Promise<Person[]>>();
	const people = (repo: string) => {
		if (!cache.has(repo)) cache.set(repo, fetch(`/${repo}/mentionable`).then((r) => (r.ok ? r.json() : []), () => []));
		return cache.get(repo)!;
	};

	let query = $state<string | null>(null);
	let all = $state<Person[]>([]);
	let active = $state(0);
	let pos = $state({ left: 0, top: 0, up: false });

	const matches = $derived.by(() => {
		if (query === null) return [];
		const q = query.toLowerCase();
		return [AGENT, ...all].filter((p) => p.login.toLowerCase().startsWith(q) || p.full_name.toLowerCase().includes(q)).slice(0, 8);
	});

	// Where character `i` sits on screen. A textarea doesn't say, so lay the same text out in an invisible copy with the same styles and measure a marker.
	function caret(el: HTMLTextAreaElement, i: number) {
		const style = getComputedStyle(el);
		const copy = document.createElement('div');
		for (const k of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'tabSize', 'textTransform', 'wordSpacing'] as const) copy.style[k] = style[k];
		Object.assign(copy.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${el.offsetWidth}px`, top: '0', left: '0' });
		copy.textContent = el.value.slice(0, i);
		const mark = copy.appendChild(document.createElement('span'));
		mark.textContent = '@';
		document.body.append(copy);
		const r = el.getBoundingClientRect();
		const m = mark.getBoundingClientRect();
		copy.remove();
		const top = r.top + m.top - el.scrollTop;
		return { left: r.left + m.left - el.scrollLeft, top, bottom: top + m.height };
	}

	// The `@word` being typed right before the caret, if any; same boundary rule as the server's @agent detection.
	function update() {
		if (!input) return;
		const m = input.value.slice(0, input.selectionStart).match(/(?<![\w.@/-])@([\w.-]*)$/);
		query = m && input.selectionStart === input.selectionEnd ? m[1] : null;
		if (query === null) return;
		active = 0;
		place();
		people(`${page.params.owner}/${page.params.repo}`).then((p) => {
			all = p;
			place();
		});
	}

	// Open below the @; near the bottom of the window, scroll to make room, and only open upwards if the page can't scroll.
	function place() {
		if (!input || query === null) return;
		const i = input.selectionStart - query.length - 1;
		const need = matches.length * 34 + 16;
		let at = caret(input, i);
		if (innerHeight - at.bottom < need) {
			scrollBy(0, need - (innerHeight - at.bottom));
			at = caret(input, i);
		}
		const up = innerHeight - at.bottom < need;
		pos = { left: at.left, top: up ? innerHeight - at.top + 2 : at.bottom + 2, up };
	}

	function pick(p: Person) {
		if (!input || query === null) return;
		const end = input.selectionStart;
		const start = end - query.length;
		input.setRangeText(`${p.login} `, start, end, 'end');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.focus();
		query = null;
	}

	$effect(() => {
		const el = input;
		if (!el) return;
		const keydown = (e: KeyboardEvent) => {
			if (!matches.length) return;
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
			else if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.shiftKey) pick(matches[active]);
			else if (e.key === 'Escape') query = null;
			else return;
			// Stop the composer's own Enter/Escape handling (submit, close) from also running.
			e.preventDefault();
			e.stopPropagation();
		};
		const close = () => (query = null);
		el.addEventListener('input', update);
		el.addEventListener('click', update);
		el.addEventListener('keydown', keydown);
		el.addEventListener('blur', close);
		return () => {
			el.removeEventListener('input', update);
			el.removeEventListener('click', update);
			el.removeEventListener('keydown', keydown);
			el.removeEventListener('blur', close);
		};
	});
</script>

{#if matches.length}
	<ul class="mentions" role="listbox" style:left="{pos.left}px" style:top={pos.up ? null : `${pos.top}px`} style:bottom={pos.up ? `${pos.top}px` : null}>
		{#each matches as p, i (p.login)}
			<!-- mousedown, not click: a click would blur the textarea first and close the list. -->
			<li role="option" aria-selected={i === active} class:active={i === active} onmousedown={(e) => (e.preventDefault(), pick(p))} onmouseenter={() => (active = i)}>
				{#if p.avatar_url}<img src={p.avatar_url} alt="" />{:else}<span class="bot">@</span>{/if}
				<strong>{p.login}</strong>
				{#if p.full_name && p.full_name !== p.login}<span class="muted">{p.full_name}</span>{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.mentions {
		position: fixed;
		z-index: 50;
		min-width: 16rem;
		max-width: 24rem;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--fg) 14%, transparent);
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		white-space: nowrap;
	}
	li.active {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	img,
	.bot {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		flex: none;
	}
	.bot {
		display: grid;
		place-items: center;
		font-size: 0.75rem;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 15%, transparent);
	}
	.muted {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
