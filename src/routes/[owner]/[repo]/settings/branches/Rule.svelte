<script lang="ts">
	import { enhance } from '$app/forms';

	type Rule = { pattern: string; approvals: number; checks: string[]; blockRejected: boolean; dismissStale: boolean; push: string; force: boolean };
	let { rule, seen, error, onsaved }: { rule?: Rule; seen: string[]; error?: string; onsaved?: () => void } = $props();
	const r = $derived(rule ?? { pattern: '', approvals: 0, checks: [], blockRejected: true, dismissStale: false, push: 'none', force: false });
	const offered = $derived([...new Set([...r.checks, ...seen])]);
</script>

<form
	class="rule"
	method="POST"
	action="?/save"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: !rule });
			if (result.type === 'success') onsaved?.();
		}}
>
	<input type="hidden" name="old" value={rule?.pattern ?? ''} />
	<label class="field">Branch or pattern <input name="pattern" value={r.pattern} required placeholder="main, or release/*" autocomplete="off" /><small><code>*</code> matches within a segment, <code>**</code> across them</small></label>
	<fieldset>
		<legend>Merging</legend>
		<label class="field num">Approvals needed <input type="number" name="approvals" min="0" max="20" value={r.approvals} /></label>
		<label class="check"><input type="checkbox" name="block_rejected" checked={r.blockRejected} /><span>Block merging while changes are requested</span></label>
		<label class="check"><input type="checkbox" name="dismiss_stale" checked={r.dismissStale} /><span>Dismiss approvals when new commits are pushed</span></label>
	</fieldset>
	<fieldset>
		<legend>Required checks</legend>
		{#each offered as c (c)}
			<label class="check"><input type="checkbox" name="check" value={c} checked={r.checks.includes(c)} /><span><code>{c}</code></span></label>
		{:else}
			<p class="lead none">No checks have reported in this repo yet.</p>
		{/each}
		<label class="field">Other checks <textarea name="other" rows="2" placeholder="One per line, exactly as the status is named"></textarea></label>
	</fieldset>
	<fieldset>
		<legend>Pushing</legend>
		<label class="check"><input type="radio" name="push" value="none" checked={r.push === 'none'} /><span>Nobody<small>Changes land only through pull requests</small></span></label>
		<label class="check"><input type="radio" name="push" value="admins" checked={r.push === 'admins'} /><span>Admins</span></label>
		<label class="check"><input type="radio" name="push" value="all" checked={r.push === 'all'} /><span>Everyone with write access</span></label>
		<label class="check"><input type="checkbox" name="force" checked={r.force} /><span>Allow force pushes<small>By whoever may push. Deleting a protected branch is never allowed.</small></span></label>
	</fieldset>
	<div class="actions">
		<button class="primary">{rule ? 'Save' : 'Add rule'}</button>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
</form>

<style>
	.rule {
		display: grid;
		gap: 1.1rem;
	}
	.num {
		max-width: 10rem;
	}
	.none {
		margin: 0;
	}
</style>
