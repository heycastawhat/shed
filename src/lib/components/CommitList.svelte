<script lang="ts">
	import Icon from './Icon.svelte';
	import { ago } from '#lib/time.js';

	type Commit = {
		sha: string;
		commit: { message: string; author: { name: string; date: string } };
		author: { login: string; avatar_url: string } | null;
	};
	let { repo, commits }: { repo: string; commits: Commit[] } = $props();

	const day = (d: string) => new Date(d).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
	const days = $derived(
		commits.reduce<{ day: string; commits: Commit[] }[]>((out, c) => {
			const d = day(c.commit.author.date);
			if (out.at(-1)?.day === d) out.at(-1)!.commits.push(c);
			else out.push({ day: d, commits: [c] });
			return out;
		}, [])
	);
</script>

{#each days as g (g.day)}
	<h3><Icon name="commit" size={14} />Commits on {g.day}</h3>
	<ul class="commits">
		{#each g.commits as c (c.sha)}
			{@const [title, ...body] = c.commit.message.trim().split('\n')}
			<li>
				<div class="msg">
					<a href="/{repo}/commit/{c.sha}"><strong>{title}</strong></a>
					{#if body.join('').trim()}<details><summary>…</summary><pre>{body.join('\n').trim()}</pre></details>{/if}
				</div>
				<div class="meta">
					{#if c.author}<img src={c.author.avatar_url} alt="" />{:else}<span class="initial">{c.commit.author.name[0]?.toUpperCase()}</span>{/if}
					<span>{c.author?.login ?? c.commit.author.name}</span>
					<span title={c.commit.author.date}>{ago(c.commit.author.date)}</span>
					<a href="/{repo}/commit/{c.sha}"><code>{c.sha.slice(0, 8)}</code></a>
				</div>
			</li>
		{/each}
	</ul>
{/each}

<style>
	h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 1.25rem 0 0.5rem;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--muted);
	}
	h3:first-child {
		margin-top: 0;
	}
	.initial {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--muted);
	}
	.commits {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	li {
		padding: 0.7rem 1rem;
	}
	li:hover {
		background: var(--surface);
	}
	li:first-child {
		border-radius: 8px 8px 0 0;
	}
	li:last-child {
		border-radius: 0 0 8px 8px;
	}
	li:only-child {
		border-radius: 8px;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.msg {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	strong {
		font-weight: 500;
	}
	summary {
		cursor: pointer;
		color: var(--muted);
		list-style: none;
	}
	details pre {
		white-space: pre-wrap;
		font-size: 0.85rem;
		color: var(--muted);
		margin: 0.4rem 0 0;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.35rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.meta img {
		width: 18px;
		height: 18px;
		border-radius: 50%;
	}
	code {
		font-family: var(--mono);
	}
	a {
		color: var(--fg);
	}
	.meta a {
		margin-left: auto;
		color: var(--muted);
	}
</style>
