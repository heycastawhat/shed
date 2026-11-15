<script lang="ts">
	import { enhance } from '$app/forms';

	type Hook = { id: number; url: string; events: string[]; active: boolean };
	let { hook, events, error, onsaved }: { hook?: Hook; events: string[]; error?: string; onsaved?: () => void } = $props();
	const LABELS: Record<string, string> = {
		push: 'Push: commits and tags pushed',
		pull_request: 'Pull request: opened, closed, merged, reopened, new commits',
		issues: 'Issues: opened, closed, reopened',
		issue_comment: 'Comments on issues and pull requests',
		release: 'Release published'
	};
</script>

<form
	class="hook"
	method="POST"
	action="?/save"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: !hook });
			if (result.type === 'success') onsaved?.();
		}}
>
	<input type="hidden" name="id" value={hook?.id ?? ''} />
	<label class="field">URL <input name="url" type="url" required value={hook?.url ?? ''} placeholder="https://example.com/hook" autocomplete="off" /><small>Shed POSTs JSON here; redirects aren't followed</small></label>
	<label class="field"
		>Secret <input name="secret" type="password" autocomplete="new-password" placeholder={hook ? 'Unchanged' : 'Optional'} /><small
			>Signs each body: <code>X-Hub-Signature-256: sha256=…</code> and <code>X-Forgejo-Signature</code> (HMAC-SHA256)</small
		></label
	>
	<fieldset>
		<legend>Events</legend>
		{#each events as e (e)}
			<label class="check"><input type="checkbox" name="event" value={e} checked={hook ? hook.events.includes(e) : e === 'push'} /><span>{LABELS[e] ?? e}</span></label>
		{/each}
	</fieldset>
	<label class="check"><input type="checkbox" name="active" checked={hook?.active ?? true} /><span>Active</span></label>
	<div class="actions">
		<button class="primary">{hook ? 'Save' : 'Add webhook'}</button>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
</form>

<style>
	.hook {
		display: grid;
		gap: 1rem;
	}
</style>
