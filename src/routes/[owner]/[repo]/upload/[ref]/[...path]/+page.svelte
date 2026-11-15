<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import CommitBox from '#lib/components/CommitBox.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { refPath } from '#lib/repo.js';

	let { data, form } = $props();
	const dir = $derived(page.params.path ?? '');
	let input = $state<HTMLInputElement>();
	let names = $state<{ name: string; size: number }[]>([]);
	let over = $state(false);
	let busy = $state(false);

	const sync = () => (names = [...(input?.files ?? [])].map((f) => ({ name: f.name, size: f.size })));
	function drop(e: DragEvent) {
		e.preventDefault();
		over = false;
		if (!input || !e.dataTransfer?.files.length) return;
		const all = new DataTransfer();
		for (const f of [...(input.files ?? []), ...e.dataTransfer.files]) all.items.add(f);
		input.files = all.files;
		sync();
	}
	const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
</script>

<svelte:head><title>Upload files · {data.repo.full_name}</title></svelte:head>

{#if dir}<Breadcrumbs repo={data.repo.full_name} ref={data.ref} path={dir} />{/if}

<form
	method="POST"
	enctype="multipart/form-data"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<label
		class="drop"
		class:over
		ondragover={(e) => (e.preventDefault(), (over = true))}
		ondragleave={() => (over = false)}
		ondrop={drop}
	>
		<Icon name="upload" size={28} />
		<strong>Drop files here or click to choose</strong>
		<span class="muted">They'll go into <code>{dir || '/'}</code> on <code>{data.ref}</code>; files with the same name are replaced.</span>
		<input bind:this={input} type="file" name="files" multiple onchange={sync} />
	</label>
	{#if names.length}
		<ul class="files">
			{#each names as f (f.name)}<li><Icon name="file" size={14} /><span class="name">{f.name}</span><span class="muted">{size(f.size)}</span></li>{/each}
		</ul>
	{/if}
	<CommitBox
		ref={data.ref}
		login={data.user?.login ?? 'patch'}
		error={form?.error}
		{busy}
		cancel="/{data.repo.full_name}/tree/{refPath(data.ref, dir)}"
		placeholder={names.length === 1 ? `Add ${names[0].name}` : names.length ? `Add ${names.length} files` : 'Add files'}
	/>
</form>

<style>
	form {
		display: grid;
		gap: 1rem;
	}
	.drop {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 0.4rem;
		padding: 2.5rem 1rem;
		border: 1px dashed var(--border);
		border-radius: 8px;
		text-align: center;
		color: var(--muted);
		cursor: pointer;
	}
	.drop strong {
		color: var(--fg);
	}
	.drop.over,
	.drop:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}
	.drop:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.drop input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.files {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.files li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.9rem;
		font-size: 0.9rem;
	}
	.files li + li {
		border-top: 1px solid var(--border);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
