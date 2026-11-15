<script lang="ts">
	import Byline from '#lib/components/Byline.svelte';
	import LabelChip from '#lib/components/LabelChip.svelte';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const groups = $derived([
		{ title: 'Needs your review', empty: 'Nobody is waiting on your review.', list: data.review },
		{ title: 'Opened by you', empty: 'You have no open pull requests.', list: data.mine }
	]);
</script>

<h1>Changes</h1>

{#each groups as g (g.title)}
	<h2>{g.title} <span class="count">{g.list.length}</span></h2>
	<ul>
		{#each g.list as c (c.href)}
			<li>
				<a class="row" href={c.href}>
					<img src={c.avatar} alt="" />
					<div class="main">
						<span class="title">{c.title}</span>
						{#if c.draft}<span class="tag">draft</span>{/if}
						{#each c.labels as l (l.id)}<span class="chip"><LabelChip label={l} /></span>{/each}
						<div class="muted meta">{c.repo} #{c.number} · <Byline login={c.author} agent={c.agent} /> · updated {ago(c.updated)}{#if c.comments} · {c.comments} comment{c.comments === 1 ? '' : 's'}{/if}</div>
					</div>
				</a>
			</li>
		{:else}
			<li class="empty muted">{g.empty}</li>
		{/each}
	</ul>
{/each}

<style>
	h1 {
		margin-top: 0;
	}
	h2 {
		margin: 1.6rem 0 0.6rem;
		font-size: 1rem;
	}
	.count {
		margin-left: 0.3rem;
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--surface);
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--muted);
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.75rem 1rem;
		color: var(--fg);
	}
	.row:hover {
		background: var(--surface);
	}
	img {
		width: 28px;
		height: 28px;
		border-radius: 50%;
	}
	.title {
		font-weight: 600;
	}
	.chip {
		margin-left: 0.35rem;
	}
	.meta {
		margin-top: 0.1rem;
		font-size: 0.82rem;
	}
	.empty {
		padding: 1rem;
	}
</style>
