import { getContext, setContext } from 'svelte';

export type NavMode = 'sidebar' | 'bar';
export type Layout = 'classic' | 'tabs' | 'split';
export const LAYOUTS: Layout[] = ['classic', 'tabs', 'split'];

// One instance per root layout (via context), so it is never shared between requests on the server.
export class Prefs {
	nav = $state<NavMode>('sidebar');
	collapsed = $state(false);
	// As in Sink: Classic, or Tabs (PRs, issues and files you open stay as tabs across the top of the sheet).
	layout = $state<Layout>('classic');
	palette = $state(false);

	constructor(initial: { nav: NavMode; collapsed: boolean; layout?: Layout }) {
		this.nav = initial.nav;
		this.collapsed = initial.collapsed;
		this.layout = initial.layout ?? 'classic';
	}

	async save(patch: { nav?: NavMode; collapsed?: boolean; layout?: Layout }) {
		Object.assign(this, patch);
		await fetch('/prefs', { method: 'POST', body: JSON.stringify(patch) });
	}
}

const KEY = Symbol('prefs');
export const setPrefs = (p: Prefs) => setContext(KEY, p);
export const getPrefs = () => getContext<Prefs>(KEY);
