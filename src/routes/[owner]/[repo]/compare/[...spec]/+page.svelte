<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import CommitList from '#lib/components/CommitList.svelte';
	import DiffView from '#lib/components/DiffView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import MentionPicker from '#lib/components/MentionPicker.svelte';

	let { data, form } = $props();
	const base = $derived(`/${data.repo.full_name}`);
	const enc = (ref: string) => ref.split(':').map(encodeURIComponent).join(':');
	const go = (b: string, h: string) => goto(`${base}/compare/${enc(b)}...${enc(h)}`);
	// A head from a fork isn't in this repo's branch list; keep it selectable.
	const heads = $derived(data.branches.includes(data.head) || !data.head ? data.branches : [data.head, ...data.branches]);
	let title = $derived(data.draft?.title ?? '');
	let body = $derived(data.draft?.body ?? '');
	let busy = $state(false);
	let input = $state<HTMLTextAreaElement>();
	const c = $derived(data.compare);
</script>

<svelte:head><title>Compare {data.base}...{data.head} · {data.repo.full_name}</title></svelte:head>

<h1>{c && !data.existing && data.user ? 'Open a pull request' : 'Compare changes'}</h1>
<p class="muted lead">Pick the branch your changes are on, and the branch they should go into.</p>

<div class="pick">
	<Icon name="branch" size={16} />
	<label>
		<span class="muted">base</span>
		<select value={data.base} onchange={(e) => go(e.currentTarget.value, data.head)} aria-label="Base branch">
			{#each data.branches as b (b)}<option value={b}>{b}</option>{/each}
		</select>
	</label>
	<Icon name="left" size={16} />
	<label>
		<span class="muted">compare</span>
		<select value={data.head} onchange={(e) => go(data.base, e.currentTarget.value)} aria-label="Head branch">
			{#if !data.head}<option value="" disabled>Choose a branch</option>{/if}
			{#each heads as b (b)}<option value={b}>{b}</option>{/each}
		</select>
	</label>
	{#if c && c.total_commits}
		<span class="merge-state" class:bad={!c.mergeable}>
			<Icon name={c.mergeable ? 'check' : 'x'} size={14} />{c.mergeable ? 'Able to merge' : "Can't merge automatically"}
		</span>
	{/if}
</div>

{#if !data.head}
	<div class="note"><strong>Choose a branch to compare.</strong> <span class="muted">Its commits and changes against {data.base} show up here.</span></div>
{:else if data.missing}
	<div class="note"><strong>Nothing to compare.</strong> <span class="muted">There's no branch called {data.head} or {data.base} here.</span></div>
{:else if c && !c.total_commits}
	<div class="note"><strong>{data.base === data.head ? 'Those are the same branch.' : 'Nothing to compare.'}</strong> <span class="muted">{data.base} already has everything in {data.head}.</span></div>
{:else if c}
	{#if data.existing}
		<div class="note">
			<Icon name="changes" size={16} />
			<span>There's already an open pull request for these branches: <a href="{base}/pulls/{data.existing.number}">{data.existing.title} #{data.existing.number}</a></span>
		</div>
	{:else if !data.user}
		<div class="note"><a href="/login">Sign in</a> to open a pull request.</div>
	{:else}
		<form
			class="open"
			method="POST"
			action="?/open"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<div class="main">
				<input class="title" name="title" bind:value={title} placeholder="Title" aria-label="Title" required />
				<textarea bind:this={input} name="body" bind:value={body} rows="8" placeholder="Describe the change (Markdown supported)"></textarea>
				<MentionPicker {input} />
				<div class="bar">
					<label class="check"><input type="checkbox" name="draft" /> Open as a draft</label>
					{#if form?.action === 'open'}<span class="error">{form.error}</span>{/if}
					<button class="primary" disabled={busy || !title.trim()}>{busy ? 'Opening…' : 'Open pull request'}</button>
				</div>
			</div>
			{#if data.options}
				<aside>
					<fieldset>
						<legend>Reviewers</legend>
						{#each data.options.reviewers.filter((u) => u.id !== data.user?.id) as u (u.id)}
							<label class="opt"><input type="checkbox" name="reviewers" value={u.login} /><img src={u.avatar_url} alt="" />{u.login}</label>
						{:else}
							<p class="muted none">No one else can review here</p>
						{/each}
					</fieldset>
					{#if data.repo.permissions.push}
						<fieldset>
							<legend>Labels</legend>
							{#each data.options.labels as l (l.id)}
								<label class="opt"><input type="checkbox" name="labels" value={l.id} /><LabelChip label={l} /></label>
							{:else}
								<p class="muted none">This repo has no labels</p>
							{/each}
						</fieldset>
					{/if}
				</aside>
			{/if}
		</form>
	{/if}

	<h2><Icon name="commit" size={16} />{c.total_commits} commit{c.total_commits === 1 ? '' : 's'} <span class="muted">· {c.files.length} file{c.files.length === 1 ? '' : 's'} changed</span></h2>
	<CommitList repo={data.repo.full_name} commits={c.commits} />
	<h2><Icon name="diff" size={16} />Changes</h2>
	<DiffView files={c.files} />
{/if}

<style>
	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.4rem;
	}
	.lead {
		margin: 0 0 1rem;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 2rem 0 0.75rem;
		font-size: 1.05rem;
	}
	h2 .muted {
		font-weight: 400;
	}
	.pick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--muted);
	}
	.pick label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		font-size: 0.85rem;
	}
	select {
		min-width: 0;
		max-width: 16rem;
		font: inherit;
		font-family: var(--mono);
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
	}
	.merge-state {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
		font-size: 0.9rem;
		color: var(--accent);
	}
	.merge-state.bad {
		color: var(--del-fg);
	}
	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.open {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15rem;
		gap: 2rem;
		align-items: start;
		margin-top: 1rem;
	}
	.main {
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.main:focus-within {
		border-color: var(--accent);
	}
	.title {
		display: block;
		width: 100%;
		box-sizing: border-box;
		padding: 0.75rem 1rem;
		border: 0;
		border-bottom: 1px solid var(--border);
		border-radius: 8px 8px 0 0;
		font: inherit;
		font-size: 1.05rem;
		font-weight: 600;
		background: var(--bg);
		color: var(--fg);
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		padding: 0.75rem 1rem;
		font: inherit;
		background: var(--bg);
		color: var(--fg);
		resize: vertical;
	}
	.title:focus,
	textarea:focus {
		outline: none;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
		border-radius: 0 0 8px 8px;
	}
	.bar .primary {
		margin-left: auto;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	fieldset {
		margin: 0 0 1.25rem;
		padding: 0;
		border: 0;
	}
	legend {
		width: 100%;
		margin-bottom: 0.6rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.2rem 0;
		font-size: 0.9rem;
	}
	.opt img {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}
	.none {
		margin: 0;
		font-size: 0.85rem;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
	@media (max-width: 900px) {
		.open {
			grid-template-columns: minmax(0, 1fr);
			gap: 1rem;
		}
	}
	@media (max-width: 700px) {
		.pick label {
			flex: 1 1 100%;
		}
		.pick label select {
			flex: 1;
			max-width: none;
		}
		.merge-state {
			margin-left: 0;
		}
		.pick > :global(svg) {
			display: none;
		}
	}
</style>
