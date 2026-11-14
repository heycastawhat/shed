<script lang="ts">
	import ActivityFeed from '#lib/components/ActivityFeed.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const o = $derived(data.owner);
	const joined = $derived(new Date(o.created).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }));
	const pinned = $derived(new Set(data.pins));

	let filter = $state('');
	const repos = $derived(data.repos.filter((r) => !filter || `${r.name} ${r.description}`.toLowerCase().includes(filter.toLowerCase())));

	const total = $derived(data.days?.reduce((n, d) => n + d.count, 0) ?? 0);
	// Shade by quartile of the busiest day, like GitHub, so one huge day doesn't wash the rest out.
	const max = $derived(Math.max(1, ...(data.days?.map((d) => d.count) ?? [])));
	const level = (n: number) => (n ? Math.min(4, Math.ceil((n / max) * 4)) : 0);
	// A month label over the first week column that starts in that month.
	const months = $derived(
		(data.days ?? []).flatMap((d, i) =>
			i % 7 === 0 && d.date.slice(5, 7) !== data.days![Math.max(0, i - 7)].date.slice(5, 7) ? [{ week: i / 7, label: new Date(d.date).toLocaleDateString('en-NZ', { month: 'short' }) }] : []
		)
	);

	// A stable colour per language; the common ones get their usual colours.
	const LANGS: Record<string, string> = { TypeScript: '#3178c6', JavaScript: '#f1e05a', Svelte: '#ff3e00', Go: '#00add8', Rust: '#dea584', Python: '#3572a5', Shell: '#89e051', HTML: '#e34c26', CSS: '#663399' };
	const lang = (l: string) => LANGS[l] ?? `hsl(${[...l].reduce((h, c) => h * 31 + c.charCodeAt(0), 0) % 360} 55% 55%)`;

</script>

<svelte:head><title>{o.full_name || o.login}</title></svelte:head>

<div class="profile">
	<aside>
		<img class="avatar" src={o.avatar_url} alt="" />
		<h1>{o.full_name || o.login}</h1>
		{#if o.full_name}<div class="login muted">{o.login}</div>{/if}
		{#if data.members}<span class="tag">Organization</span>{/if}
		{#if o.description}<p class="bio">{o.description}</p>{/if}
		{#if !data.members && (o.followers_count || o.following_count)}
			<div class="muted counts"><Icon name="group" size={14} /><strong>{o.followers_count}</strong> followers · <strong>{o.following_count}</strong> following</div>
		{/if}
		<ul class="meta muted">
			{#if o.location}<li><Icon name="location" size={14} />{o.location}</li>{/if}
			{#if o.website}<li><Icon name="link" size={14} /><a href={o.website} rel="noreferrer">{o.website.replace(/^https?:\/\//, '')}</a></li>{/if}
			<li><Icon name="calendar" size={14} />Joined {joined}</li>
		</ul>
		{#if data.members?.length}
			<h2>Members <span class="count">{data.members.length}</span></h2>
			<div class="faces">
				{#each data.members as m (m.id)}<a href="/{m.login}" title={m.login}><img src={m.avatar_url} alt={m.login} /></a>{/each}
			</div>
		{/if}
		{#if data.orgs.length}
			<h2>Organizations</h2>
			<div class="faces">
				{#each data.orgs as g (g.id)}<a href="/{g.name}" title={g.full_name || g.name}><img class="square" src={g.avatar_url} alt={g.name} /></a>{/each}
			</div>
		{/if}
	</aside>

	<div class="main">
		{#if data.days}
			<section>
				<h2>{total} contribution{total === 1 ? '' : 's'} in the last year</h2>
				<div class="heat">
					<div class="scroll">
						<div class="year">
							<div class="months">
								{#each months as m (m.week)}<span style:grid-column={m.week + 1}>{m.label}</span>{/each}
							</div>
							<div class="cells">
								{#each data.days as d (d.date)}
									<span class="l{level(d.count)}" title="{d.count || 'No'} contribution{d.count === 1 ? '' : 's'} on {new Date(d.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}"></span>
								{/each}
							</div>
						</div>
					</div>
					<div class="legend muted">Less {#each [0, 1, 2, 3, 4] as l (l)}<span class="l{l}"></span>{/each} More</div>
				</div>
			</section>
		{/if}

		<section>
			<div class="head">
				<h2>Repositories <span class="count">{data.repos.length}</span></h2>
				{#if data.repos.length > 4}<input type="search" placeholder="Find a repository…" bind:value={filter} aria-label="Find a repository" />{/if}
			</div>
			<div class="repos">
				{#each repos as r (r.id)}
					<div class="repo">
						<div class="top">
							<a href="/{r.full_name}"><Icon name={r.fork ? 'fork' : 'repos'} size={15} />{r.name}</a>
							{#if r.private}<span class="tag"><Icon name="lock" size={11} /> Private</span>{/if}
							<form method="POST" action="/pin">
								<input type="hidden" name="repo" value={r.full_name} />
								<input type="hidden" name="pin" value={pinned.has(r.full_name) ? '0' : '1'} />
								<button class="pin" class:on={pinned.has(r.full_name)} title={pinned.has(r.full_name) ? 'Unpin from sidebar' : 'Pin to sidebar'}><Icon name="pin" size={13} /></button>
							</form>
						</div>
						<p class:muted={!r.description}>{r.description || (r.empty ? 'Empty repository' : 'No description')}</p>
						<div class="stats muted">
							{#if r.language}<span><i style:background={lang(r.language)}></i>{r.language}</span>{/if}
							{#if r.stars_count}<span><Icon name="star" size={13} />{r.stars_count}</span>{/if}
							{#if r.forks_count}<span><Icon name="fork" size={13} />{r.forks_count}</span>{/if}
							<span>Updated {ago(r.updated_at)}</span>
						</div>
					</div>
				{:else}
					<p class="empty muted">{filter ? 'No repositories match.' : 'No repositories you can see.'}</p>
				{/each}
			</div>
		</section>

		{#if data.feed.length}
			<section>
				<h2>Recent activity</h2>
				<ActivityFeed feed={data.feed} who={!!data.members} />
			</section>
		{/if}
	</div>
</div>

<style>
	.profile {
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		gap: 2.5rem;
		align-items: start;
	}
	aside {
		position: sticky;
		top: 1.5rem;
	}
	.avatar {
		width: 11rem;
		aspect-ratio: 1;
		border-radius: 50%;
		border: 1px solid var(--border);
	}
	h1 {
		margin: 1rem 0 0;
		font-size: 1.5rem;
		line-height: 1.2;
	}
	.login {
		font-size: 1.1rem;
	}
	aside .tag {
		display: inline-block;
		margin-top: 0.5rem;
	}
	.bio {
		margin: 0.9rem 0 0;
	}
	.counts {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.9rem;
		font-size: 0.9rem;
	}
	.counts strong {
		color: var(--fg);
	}
	.meta {
		list-style: none;
		padding: 0;
		margin: 0.9rem 0 0;
		font-size: 0.9rem;
	}
	.meta li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.35rem;
	}
	h2 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
	}
	aside h2 {
		margin: 1.5rem 0 0.6rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
		font-size: 0.9rem;
	}
	.count {
		margin-left: 0.25rem;
		padding: 0 0.45rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 500;
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
	.faces {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.faces img {
		width: 32px;
		height: 32px;
		border-radius: 50%;
	}
	.faces img.square {
		border-radius: 6px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		min-width: 0;
	}

	.heat {
		padding: 0.9rem 1rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.scroll {
		display: flex;
		flex-direction: row-reverse;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.year {
		flex: 1 0 0;
		min-width: 36rem;
	}
	.months,
	.cells {
		display: grid;
		grid-template-columns: repeat(53, minmax(8px, 1fr));
		gap: 3px;
	}
	.months {
		font-size: 0.7rem;
		color: var(--muted);
		height: 1.1rem;
	}
	.months span {
		white-space: nowrap;
	}
	.months span:last-child {
		justify-self: end;
	}
	.cells {
		grid-template-rows: repeat(7, auto);
		grid-auto-flow: column;
	}
	.cells span,
	.legend span {
		aspect-ratio: 1;
		border-radius: 2px;
	}
	.l0 {
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}
	.l1 {
		background: color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.l2 {
		background: color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.l3 {
		background: color-mix(in srgb, var(--accent) 80%, transparent);
	}
	.l4 {
		background: var(--accent);
	}
	.legend {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 3px;
		margin-top: 0.6rem;
		font-size: 0.75rem;
	}
	.legend span {
		width: 10px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.head h2 {
		margin: 0;
	}
	.head input {
		width: 14rem;
	}
	.repos {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
		gap: 0.75rem;
	}
	.repo {
		display: flex;
		flex-direction: column;
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.top a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.top form {
		margin-left: auto;
	}
	.pin {
		display: inline-flex;
		padding: 0.2rem;
		border-color: transparent;
		background: none;
		color: var(--muted);
		opacity: 0;
	}
	.repo:hover .pin,
	.pin:focus-visible,
	.pin.on {
		opacity: 1;
	}
	.pin.on {
		color: var(--accent);
	}
	.repo p {
		flex: 1;
		margin: 0.4rem 0 0.7rem;
		font-size: 0.875rem;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		font-size: 0.8rem;
	}
	.stats span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.stats i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.empty {
		grid-column: 1 / -1;
		padding: 2rem;
		text-align: center;
		border: 1px dashed var(--border);
		border-radius: 8px;
	}

	@media (max-width: 760px) {
		.profile {
			grid-template-columns: 1fr;
		}
		aside {
			position: static;
		}
		.avatar {
			width: 96px;
		}
	}
</style>
