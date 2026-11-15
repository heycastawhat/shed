<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const s = $derived(data.settings);
	const full = $derived(data.repo.full_name);
	const styles = $derived([
		['merge', 'Merge commit', 'Keeps every commit and adds a merge commit', s.allow_merge_commits],
		['rebase', 'Rebase', 'Replays the commits onto the base, no merge commit', s.allow_rebase],
		['rebase-merge', 'Rebase, then merge commit', 'Replays the commits, then adds a merge commit', s.allow_rebase_explicit],
		['squash', 'Squash', 'Folds everything into one commit', s.allow_squash_merge],
		['fast-forward-only', 'Fast-forward only', 'Only when the base has not moved', s.allow_fast_forward_only_merge]
	] as const);
	let confirm = $state('');
	const msg = (action: string) => (form?.action === action ? form : null);
</script>

<svelte:head><title>Settings · {full}</title></svelte:head>

{#if s.archived}
	<p class="banner" role="status">This repository is archived: it's read-only until you unarchive it at the bottom of this page.</p>
{/if}

<section>
	<h2>General</h2>
	<p class="lead">What people see, and which parts of the repo are on.</p>
	<form class="card" method="POST" action="?/general" use:enhance={() => ({ update }) => update({ reset: false })}>
		<label class="field">Description <input name="description" value={s.description} placeholder="A short line about this repo" disabled={s.archived} /></label>
		<fieldset disabled={s.archived}>
			<legend>Visibility</legend>
			<label class="check"><input type="radio" name="visibility" value="private" checked={s.private} /><span>Private<small>Only you, collaborators and members of its organisation can see it</small></span></label>
			<label class="check"><input type="radio" name="visibility" value="public" checked={!s.private} /><span>Public<small>Anyone who can reach Shed can see and clone it</small></span></label>
		</fieldset>
		{#if data.branches.length}
			<label class="field"
				>Default branch
				<select name="default_branch" value={s.default_branch} disabled={s.archived}>
					{#each data.branches as b (b)}<option>{b}</option>{/each}
				</select>
				<small>Where pull requests point and what a clone checks out</small>
			</label>
		{/if}
		<fieldset disabled={s.archived}>
			<legend>Features</legend>
			<label class="check"><input type="checkbox" name="has_issues" checked={s.has_issues} /><span>Issues</span></label>
			<label class="check"><input type="checkbox" name="has_wiki" checked={s.has_wiki} /><span>Wiki</span></label>
		</fieldset>
		<div class="actions">
			<button class="primary" disabled={s.archived}>Save</button>
			{#if msg('general')?.error}<p class="error" role="alert">{msg('general')?.error}</p>{:else if msg('general')}<p class="ok" role="status">Saved</p>{/if}
		</div>
	</form>
</section>

<section>
	<h2>Merging</h2>
	<p class="lead">How pull requests may be merged.</p>
	<form class="card" method="POST" action="?/merge" use:enhance={() => ({ update }) => update({ reset: false })}>
		<fieldset disabled={s.archived}>
			<legend>Allowed styles, and the default</legend>
			{#each styles as [value, label, hint, on] (value)}
				<div class="style">
					<label class="check"><input type="checkbox" name="style" {value} checked={on} /><span>{label}<small>{hint}</small></span></label>
					<label class="default"><input type="radio" name="default_merge_style" {value} checked={s.default_merge_style === value} /> default</label>
				</div>
			{/each}
		</fieldset>
		<label class="check"
			><input type="checkbox" name="delete_branch" checked={s.default_delete_branch_after_merge} disabled={s.archived} /><span
				>Delete the branch after merging<small>The default for the checkbox on the merge button</small></span
			></label
		>
		<div class="actions">
			<button class="primary" disabled={s.archived}>Save</button>
			{#if msg('merge')?.error}<p class="error" role="alert">{msg('merge')?.error}</p>{:else if msg('merge')}<p class="ok" role="status">Saved</p>{/if}
		</div>
	</form>
</section>

<section>
	<h2>Danger zone</h2>
	<div class="card danger-zone">
		<form method="POST" action="?/rename" use:enhance>
			<h3>Rename</h3>
			<p class="lead">Old links and clone URLs stop working; update your remotes after.</p>
			<div class="row">
				<label class="field"><span class="sr">New name</span><input name="name" value={data.repo.name} required disabled={s.archived} /></label>
				<button disabled={s.archived}>Rename</button>
			</div>
			{#if msg('rename')?.error}<p class="error" role="alert">{msg('rename')?.error}</p>{/if}
		</form>
		<form method="POST" action="?/transfer" use:enhance>
			<h3>Transfer</h3>
			<p class="lead">Moves it to another owner: you, or an organization you own. Issues, pull requests and CI come along; old links stop working.</p>
			{#if data.targets.length}
				<div class="row">
					<label class="field"
						><span class="sr">New owner</span>
						<select name="new_owner" disabled={s.archived}>
							{#each data.targets as t (t)}<option>{t}</option>{/each}
						</select>
					</label>
					<button disabled={s.archived}>Transfer</button>
				</div>
			{:else}
				<p class="lead">There's nowhere to move it: you don't own an organization. <a href="/orgs/new">Create one</a>.</p>
			{/if}
			{#if msg('transfer')?.error}<p class="error" role="alert">{msg('transfer')?.error}</p>{/if}
		</form>
		<form method="POST" action="?/archive" use:enhance>
			<h3>{s.archived ? 'Unarchive' : 'Archive'}</h3>
			<p class="lead">{s.archived ? 'Makes it writable again: pushes, issues and pull requests.' : 'Makes it read-only: no pushes, issues, comments or settings changes until unarchived.'}</p>
			<input type="hidden" name="archived" value={s.archived ? '0' : '1'} />
			<button class:danger={!s.archived}>{s.archived ? 'Unarchive' : 'Archive'} this repository</button>
			{#if msg('archive')?.error}<p class="error" role="alert">{msg('archive')?.error}</p>{/if}
		</form>
		<form method="POST" action="?/delete" use:enhance>
			<h3>Delete</h3>
			<p class="lead">Removes the repo with its issues, pull requests, releases and CI runs. The git data is moved to Shed's trash folder.</p>
			<div class="row">
				<label class="field"><span>Type <strong>{full}</strong> to confirm</span> <input name="confirm" bind:value={confirm} autocomplete="off" /></label>
				<button class="danger" disabled={confirm.trim().toLowerCase() !== full.toLowerCase()}>Delete this repository</button>
			</div>
			{#if msg('delete')?.error}<p class="error" role="alert">{msg('delete')?.error}</p>{/if}
		</form>
	</div>
</section>

<style>
	.banner {
		margin: 0 0 1.5rem;
		padding: 0.7rem 1rem;
		border: 1px solid var(--warn);
		border-radius: 8px;
		background: color-mix(in srgb, var(--warn) 10%, transparent);
	}
	.style {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}
	.default {
		display: flex;
		gap: 0.3rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.danger-zone {
		gap: 0;
		padding: 0;
		border-color: color-mix(in srgb, var(--del-fg) 50%, var(--border));
	}
	.danger-zone form {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
	}
	.danger-zone form + form {
		border-top: 1px solid var(--border);
	}
	.danger-zone .lead {
		margin: 0;
	}
	.danger-zone h3 {
		margin: 0;
	}
	.danger-zone form > button {
		justify-self: start;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
