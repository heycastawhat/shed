<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Release } from '#lib/server/release.js';
	import Icon from './Icon.svelte';

	let { release, tags, branches, defaultBranch }: { release: Release | null; tags: string[]; branches: string[]; defaultBranch: string } = $props();
	let tag = $derived(release?.tag_name ?? '');
	let busy = $state(false);
	const fresh = $derived(!!tag.trim() && !tags.includes(tag.trim()));
	const err = (a: string) => (page.form?.action === a ? page.form.error : '');
	const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<h1>{release ? `Edit ${release.name || release.tag_name}` : 'New release'}</h1>

<form method="POST" action="?/save" enctype="multipart/form-data" use:enhance={submitting}>
	<div class="row">
		<label>
			<span>Tag</span>
			<input name="tag" bind:value={tag} list="release-tags" placeholder="v1.0.0" autocomplete="off" required />
			<datalist id="release-tags">{#each tags as t (t)}<option value={t}></option>{/each}</datalist>
		</label>
		{#if fresh}
			<label>
				<span>Made from</span>
				<select name="target" value={release?.target_commitish || defaultBranch}>
					{#each branches as b (b)}<option value={b}>{b}</option>{/each}
				</select>
			</label>
		{/if}
	</div>
	<p class="muted hint">
		{#if !tag.trim()}Pick an existing tag or type a new one.{:else if fresh}<Icon name="tag" size={13} /> A new tag <code>{tag.trim()}</code> is created when this is published.{:else}<Icon name="tag" size={13} /> Uses the existing tag <code>{tag.trim()}</code>.{/if}
	</p>
	<label class="full">
		<span>Title</span>
		<input name="name" value={release?.name ?? ''} placeholder={tag || 'Release title'} />
	</label>
	<label class="full">
		<span>Notes <span class="muted">(Markdown)</span></span>
		<textarea name="body" rows="12" placeholder="What changed in this release?">{release?.body ?? ''}</textarea>
	</label>

	{#if release?.assets.length}
		<div class="full">
			<span class="label">Files</span>
			<ul class="assets">
				{#each release.assets as a (a.id)}
					<li>
						<a href={a.browser_download_url}><Icon name="download" size={14} />{a.name}</a>
						<span class="muted">{size(a.size)}</span>
						<button class="ghost" formaction="?/deleteAsset" name="asset" value={a.id} formnovalidate title="Delete {a.name}" aria-label="Delete {a.name}"><Icon name="trash" size={14} /></button>
					</li>
				{/each}
			</ul>
			{#if err('asset')}<p class="error">{err('asset')}</p>{/if}
		</div>
	{/if}
	<label class="full">
		<span>{release?.assets.length ? 'Add files' : 'Files'}</span>
		<input type="file" name="files" multiple />
	</label>

	<div class="checks">
		<label><input type="checkbox" name="prerelease" checked={release?.prerelease} /> Pre-release <span class="muted">(not ready for production)</span></label>
		<label><input type="checkbox" name="draft" checked={release?.draft ?? false} /> Draft <span class="muted">(only people with write access see it, and no tag is made yet)</span></label>
	</div>

	<div class="bar">
		{#if err('save') || err('delete')}<span class="error">{err('save') || err('delete')}</span>{/if}
		{#if release}
			<button
				class="danger"
				formaction="?/delete"
				formnovalidate
				onclick={(e) => {
					if (!confirm('Delete this release and its files? The tag stays.')) e.preventDefault();
				}}>Delete release</button
			>
		{/if}
		<a class="button" href={page.url.pathname.replace(/\/releases\/.*$/, '/releases')}>Cancel</a>
		<button class="primary" disabled={busy}>{busy ? 'Saving…' : release ? 'Save' : 'Publish release'}</button>
	</div>
</form>

<style>
	h1 {
		margin: 0 0 1rem;
		font-size: 1.4rem;
	}
	form {
		display: grid;
		gap: 1rem;
		max-width: 52rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.row label {
		flex: 1 1 14rem;
		min-width: 0;
	}
	label,
	.full {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	label > span,
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	input:not([type='checkbox']):not([type='file']),
	select,
	textarea {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
	}
	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	textarea {
		resize: vertical;
	}
	.hint {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: -0.5rem 0 0;
		font-size: 0.85rem;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.assets {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 0.88rem;
	}
	.assets li {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.35rem 0.8rem;
	}
	.assets li + li {
		border-top: 1px solid var(--border);
	}
	.assets a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.assets .muted {
		margin-left: auto;
		font-size: 0.8rem;
	}
	.ghost {
		display: grid;
		place-items: center;
		padding: 0.25rem;
		border-color: transparent;
		background: none;
		color: var(--muted);
	}
	.ghost:hover {
		color: var(--del-fg);
	}
	.checks {
		display: grid;
		gap: 0.4rem;
	}
	.checks label > span {
		font-size: 0.85rem;
		font-weight: 400;
	}
	.checks label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.bar .danger {
		margin-right: auto;
		color: var(--del-fg);
		border-color: var(--del-fg);
		background: none;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.9rem;
	}
</style>
