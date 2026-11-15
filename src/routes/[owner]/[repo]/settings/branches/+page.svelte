<script lang="ts">
	import { enhance } from '$app/forms';
	import Rule from './Rule.svelte';

	let { data, form } = $props();
	let adding = $state(false);
	const summary = (r: (typeof data.rules)[number]) =>
		[
			r.push === 'none' ? 'pull requests only' : r.push === 'admins' ? 'admins may push' : 'writers may push',
			r.approvals ? `${r.approvals} approval${r.approvals === 1 ? '' : 's'}` : '',
			r.checks.length ? `${r.checks.length} required check${r.checks.length === 1 ? '' : 's'}` : '',
			r.force ? 'force push allowed' : ''
		]
			.filter(Boolean)
			.join(' · ');
	const errorFor = (pattern: string) => (form?.action === 'save' && form.rule === pattern ? form.error : undefined);
</script>

<svelte:head><title>Branches · {data.repo.full_name}</title></svelte:head>

<section>
	<div class="title">
		<div>
			<h2>Branch protection</h2>
			<p class="lead">Rules for merging into and pushing to matching branches. They apply to merges in Shed and to pushes over git.</p>
		</div>
		{#if !adding}<button class="primary" onclick={() => (adding = true)}>Add rule</button>{/if}
	</div>

	{#if adding}
		<div class="card new">
			<h3>New rule</h3>
			<Rule seen={data.seen} error={errorFor('')} onsaved={() => (adding = false)} />
			<button class="cancel" onclick={() => (adding = false)}>Cancel</button>
		</div>
	{/if}

	<ul class="list">
		{#each data.rules as r (r.pattern)}
			<li>
				<details open={!!errorFor(r.pattern)}>
					<summary>
						<code class="pattern">{r.pattern}</code>
						<span class="muted">{summary(r)}</span>
					</summary>
					<div class="edit">
						<Rule rule={r} seen={data.seen} error={errorFor(r.pattern)} />
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="pattern" value={r.pattern} />
							<button class="danger">Delete rule</button>
						</form>
					</div>
				</details>
			</li>
		{:else}
			<li class="empty">No branches are protected. Anyone with write access can push to any branch, force push and delete branches.</li>
		{/each}
	</ul>
	{#if form?.action === 'delete' && form.error}<p class="error" role="alert">{form.error}</p>{/if}
</section>

<style>
	.title {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 1rem;
	}
	.title button {
		flex: none;
	}
	.new {
		margin-bottom: 1rem;
	}
	.cancel {
		justify-self: start;
	}
	details {
		width: 100%;
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
	}
	.pattern {
		font-weight: 600;
	}
	.edit {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.edit form:last-child {
		justify-self: start;
	}
</style>
