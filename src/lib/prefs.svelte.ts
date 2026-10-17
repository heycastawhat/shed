import { getContext, setContext } from 'svelte';

export type NavMode = 'sidebar' | 'bar';

// One instance per root layout (via context), so it is never shared between requests on the server.
export class Prefs {
	nav = $state<NavMode>('sidebar');
	collapsed = $state(false);
	palette = $state(false);

	constructor(initial: { nav: NavMode; collapsed: boolean }) {
		this.nav = initial.nav;
		this.collapsed = initial.collapsed;
	}

	async save(patch: { nav?: NavMode; collapsed?: boolean }) {
		Object.assign(this, patch);
		await fetch('/prefs', { method: 'POST', body: JSON.stringify(patch) });
	}
}

const KEY = Symbol('prefs');
export const setPrefs = (p: Prefs) => setContext(KEY, p);
export const getPrefs = () => getContext<Prefs>(KEY);
