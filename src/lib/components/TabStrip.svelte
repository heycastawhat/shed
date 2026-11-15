<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';

	// The Tabs layout: every PR, issue, file and commit you open gets a tab that remembers which sub-page you were on and how far you'd
	// scrolled, so switching between reviews picks up where you left off. Tabs live in this browser (localStorage).
	type Tab = { key: string; href: string; title: string; kind: 'pull' | 'issue' | 'file' | 'commit' | 'run' };
	const KEY = 'shed:tabs';
	const SCROLL = 'shed:tab-scroll';
	const store = {
		get: <T,>(k: string, d: T): T => {
			try {
				return JSON.parse(localStorage.getItem(k) ?? '') ?? d;
			} catch {
				return d;
			}
		},
		set: (k: string, v: unknown) => {
			try {
				localStorage.setItem(k, JSON.stringify(v));
			} catch {}
		}
	};

	let tabs = $state<Tab[]>([]);
	$effect(() => {
		tabs = store.get<Tab[]>(KEY, []);
	});
	const save = () => store.set(KEY, tabs);

	// Which tab a URL belongs to: a PR or issue with all its sub-pages, a file at a ref, a commit, a CI run.
	function tabOf(url: { pathname: string; search: string }): Omit<Tab, 'title'> | null {
		const p = url.pathname;
		let m = p.match(/^\/([^/]+\/[^/]+)\/(pulls|issues)\/(\d+)(?:\/|$)/);
		if (m) return { key: `/${m[1]}/${m[2]}/${m[3]}`, href: p + url.search, kind: m[2] === 'pulls' ? 'pull' : 'issue' };
		m = p.match(/^\/([^/]+\/[^/]+)\/(blob|blame)\/([^/]+)\/(.+)$/);
		if (m) return { key: `/${m[1]}/blob/${m[3]}/${m[4]}`, href: p + url.search, kind: 'file' };
		m = p.match(/^\/([^/]+\/[^/]+)\/commit\/([0-9a-f]+)$/);
		if (m) return { key: p, href: p, kind: 'commit' };
		m = p.match(/^\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)$/);
		if (m) return { key: p, href: p + url.search, kind: 'run' };
		return null;
	}
	const current = $derived(tabOf(page.url)?.key);

	beforeNavigate(({ from }) => {
		const t = from && tabOf(from.url);
		if (!t) return;
		const scroll = store.get<Record<string, number>>(SCROLL, {});
		scroll[t.key] = window.scrollY;
		store.set(SCROLL, scroll);
	});
	let restoring = false;
	afterNavigate(() => {
		const t = tabOf(page.url);
		if (!t) return;
		// The title comes from the page's <title>, minus the repo it's in.
		setTimeout(() => {
			const title = document.title.split(' · ')[0] || t.key.split('/').pop()!;
			const i = tabs.findIndex((x) => x.key === t.key);
			if (i < 0) tabs = [...tabs, { ...t, title }].slice(-12);
			else tabs[i] = { ...tabs[i], href: t.href, title };
			save();
			if (restoring) {
				restoring = false;
				window.scrollTo(0, store.get<Record<string, number>>(SCROLL, {})[t.key] ?? 0);
			}
		}, 0);
	});

	function open(t: Tab, e: MouseEvent) {
		if (e.button === 1) return close(t, e);
		if (e.metaKey || e.ctrlKey || e.shiftKey) return;
		e.preventDefault();
		if (t.key === current) return;
		restoring = true;
		goto(t.href);
	}
	function close(t: Tab, e: Event) {
		e.preventDefault();
		e.stopPropagation();
		const i = tabs.findIndex((x) => x.key === t.key);
		tabs = tabs.filter((x) => x.key !== t.key);
		save();
		if (t.key === current) {
			const next = tabs[Math.min(i, tabs.length - 1)];
			if (next) (restoring = true), goto(next.href);
		}
	}
	const ICON = { pull: 'changes', issue: 'issue', file: 'file', commit: 'commit', run: 'actions' };
</script>

{#if tabs.length}
	<nav class="tabstrip" aria-label="Open tabs">
		{#each tabs as t (t.key)}
			<a href={t.href} class:on={t.key === current} title="{t.title} — {t.key.slice(1)}" onclick={(e) => open(t, e)} onauxclick={(e) => open(t, e)}>
				<Icon name={ICON[t.kind]} size={14} />
				<span class="title">{t.title}</span>
				<button class="x" aria-label="Close {t.title}" onclick={(e) => close(t, e)}><Icon name="x" size={12} /></button>
			</a>
		{/each}
	</nav>
{/if}

<style>
	.tabstrip {
		display: flex;
		gap: 0.3rem;
		overflow-x: auto;
		padding: 0.6rem 1rem 0;
		scrollbar-width: thin;
	}
	a {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex: 0 1 13rem;
		min-width: 7rem;
		padding: 0.4rem 0.4rem 0.4rem 0.75rem;
		border-radius: 999px;
		color: var(--muted);
		font-size: 0.86rem;
		font-weight: 500;
		background: color-mix(in srgb, var(--fg) 4%, transparent);
	}
	a:hover {
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		color: var(--fg);
	}
	a.on {
		background: var(--accent-container);
		color: var(--on-accent-container);
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.x {
		display: grid;
		place-items: center;
		padding: 0.15rem;
		border: 0;
		background: none;
		color: inherit;
		opacity: 0.6;
	}
	.x:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
	}
</style>
