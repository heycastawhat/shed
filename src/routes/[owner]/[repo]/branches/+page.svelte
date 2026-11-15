<script lang="ts">
	import { enhance } from '$app/forms';
	import Byline from '#lib/components/Byline.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { refPath } from '#lib/repo.js';
	import { commitAgent } from '#lib/sign.js';
	import { ago } from '#lib/time.js';

	let { data, form } = $props();
	const base = $derived(`/${data.repo.full_name}`);
</script>

<svelte:head><title>Branches · {data.repo.full_name}</title></svelte:head>

{#if form?.error}<p class="error">{form.error}</p>{/if}

<ul class="branches">
	{#each data.branches as b, i (b.name)}
		<li>
			<div class="name">
				<a href="{base}/tree/{refPath(b.name)}" title={b.name}><Icon name="branch" size={14} /><span>{b.name}</span></a>
				{#if i === 0}<span class="pill">default</span>{/if}
			</div>
			<div class="last">
				<a href="{base}/commit/{b.sha}">{b.message.split('\n')[0]}</a>
				<span class="muted"><Byline login={b.author} agent={commitAgent(b.message)} /> · <span title={b.date}>{ago(b.date)}</span></span>
			</div>
			<div class="ab" title={b.ahead === null ? '' : `${b.behind} behind and ${b.ahead} ahead of ${data.repo.default_branch}`}>
				{#if b.ahead !== null}<span>{b.behind} behind</span><span>{b.ahead} ahead</span>{/if}
			</div>
			<div class="pr">
				{#if b.pr}
					<a href="{base}/pulls/{b.pr.number}" title={b.pr.title}><Icon name="changes" size={14} />#{b.pr.number}</a>
				{:else if i > 0 && b.ahead !== 0 && data.repo.permissions?.push}
					<form method="POST" action="?/openPr" use:enhance>
						<input type="hidden" name="branch" value={b.name} />
						<button class="ghost">New pull request</button>
					</form>
				{/if}
			</div>
			<div class="del">
				{#if b.deletable}
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="branch" value={b.name} />
						<button class="ghost icon" title="Delete {b.name}" aria-label="Delete {b.name}" onclick={(e) => confirm(`Delete branch ${b.name}?`) || e.preventDefault()}>
							<Icon name="trash" size={15} />
						</button>
					</form>
				{/if}
			</div>
		</li>
	{/each}
</ul>

<style>
	.error {
		color: var(--del-fg);
	}
	.branches {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.92rem;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.5fr) 8.5rem 9rem 2rem;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li:hover {
		background: var(--surface);
	}
	.name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}
	.name a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.85rem;
	}
	.name a :global(svg) {
		color: var(--muted);
	}
	.name a:hover {
		color: var(--accent);
	}
	.name span,
	.last a,
	.last > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pill {
		flex: none;
		font-size: 0.72rem;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0 0.45rem;
	}
	.last {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.last a {
		color: var(--fg);
	}
	.last a:hover {
		color: var(--accent);
	}
	.last > span {
		font-size: 0.8rem;
	}
	.ab {
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
		font-size: 0.8rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.pr {
		display: flex;
		justify-content: flex-end;
	}
	.pr a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	.ghost {
		padding: 0.2rem 0.6rem;
		font-size: 0.8rem;
		background: none;
		color: var(--muted);
	}
	.ghost:hover {
		color: var(--fg);
	}
	.icon {
		display: inline-flex;
		padding: 0.3rem;
		border-color: transparent;
	}
	.icon:hover {
		color: var(--del-fg);
		border-color: var(--border) !important;
	}
	@media (max-width: 700px) {
		li {
			grid-template-columns: minmax(0, 1fr) auto auto;
			gap: 0.3rem 0.75rem;
		}
		.name,
		.last {
			grid-column: 1 / -1;
		}
		.ab {
			justify-content: flex-start;
		}
	}
</style>
