<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { refPath } from '#lib/repo.js';
	import { ago } from '#lib/time.js';

	let { data } = $props();
	const base = $derived(`/${data.repo.full_name}`);
	const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
</script>

<svelte:head><title>{data.tab === 'tags' ? 'Tags' : 'Releases'} · {data.repo.full_name}</title></svelte:head>

<div class="filters">
	<a href="?" class:on={data.tab === 'releases'}><Icon name="release" size={14} />Releases<span class="n">{data.releases.length}</span></a>
	<a href="?tags" class:on={data.tab === 'tags'}><Icon name="tag" size={14} />Tags<span class="n">{data.tags.length}</span></a>
</div>
{#if data.repo.permissions.push}<a class="button primary new" href="{base}/releases/new"><Icon name="plus" size={14} />New release</a>{/if}

{#if data.tab === 'releases'}
	{#each data.releases as r (r.id)}
		<article class="release" id="release-{r.tag_name}">
			<header>
				<h2>{r.name || r.tag_name}</h2>
				{#if r.draft}<span class="pill">Draft</span>{:else if r.prerelease}<span class="pill warn">Pre-release</span>{/if}
				{#if r === data.releases.find((x) => !x.draft && !x.prerelease)}<span class="pill latest">Latest</span>{/if}
				{#if data.repo.permissions.push}<a class="edit" href="{base}/releases/edit/{r.id}"><Icon name="pencil" size={13} />Edit</a>{/if}
			</header>
			<p class="meta">
				<a href="{base}/tree/{refPath(r.tag_name)}"><Icon name="tag" size={13} />{r.tag_name}</a> · {r.author.login} · <span title={r.published_at}>{ago(r.published_at)}</span>
			</p>
			{#if r.html}<div class="markdown">{@html r.html}</div>{/if}
			<ul class="assets">
				{#each r.assets as a (a.id)}
					<li>
						<a href={a.browser_download_url}><Icon name="download" size={14} />{a.name}</a>
						<span class="muted">{size(a.size)}{a.download_count ? ` · ${a.download_count} download${a.download_count === 1 ? '' : 's'}` : ''}</span>
					</li>
				{/each}
				<li><a href={r.zipball_url}><Icon name="zip" size={14} />Source code (zip)</a></li>
				<li><a href={r.tarball_url}><Icon name="zip" size={14} />Source code (tar.gz)</a></li>
			</ul>
		</article>
	{/each}
{:else}
	<ul class="tags">
		{#each data.tags as t (t.name)}
			<li>
				<a class="name" href="{base}/tree/{refPath(t.name)}"><Icon name="tag" size={14} />{t.name}</a>
				<span class="msg">{t.message.split('\n')[0]}</span>
				<a class="sha" href="{base}/commit/{t.commit.sha}">{t.commit.sha.slice(0, 7)}</a>
				<span class="muted when" title={t.commit.created}>{ago(t.commit.created)}</span>
				<span class="dl"><a href={t.zipball_url}>zip</a> · <a href={t.tarball_url}>tar.gz</a></span>
			</li>
		{:else}
			<li class="empty">
				<Icon name="tag" size={28} />
				<strong>No tags yet</strong>
				<span class="muted">Push a tag (<code>git tag v1.0 && git push --tags</code>) and it shows up here.</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.filters {
		display: inline-flex;
		gap: 0.2rem;
		margin-bottom: 0.9rem;
		padding: 0.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
	.filters a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.7rem;
		border-radius: 6px;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.filters a:hover {
		color: var(--fg);
	}
	.filters a.on {
		background: var(--bg);
		color: var(--fg);
		font-weight: 500;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
	}
	.n {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.new {
		float: right;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		font-weight: 600;
	}
	.new:hover {
		color: var(--bg) !important;
		filter: brightness(1.1);
	}
	.edit {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: auto;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.release:target {
		border-color: var(--accent);
	}
	.release {
		scroll-margin-top: 4rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.release + .release {
		margin-top: 1rem;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}
	.pill {
		font-size: 0.72rem;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0 0.5rem;
	}
	.pill.warn {
		color: var(--warn);
		border-color: var(--warn);
	}
	.pill.latest {
		color: var(--accent);
		border-color: var(--accent);
	}
	.meta {
		margin: 0.3rem 0 0.8rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.meta a,
	.assets a,
	.tags .name {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.meta a {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--fg);
	}
	.assets {
		list-style: none;
		margin: 0.9rem 0 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 0.88rem;
	}
	.assets li,
	.tags li {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.45rem 0.8rem;
	}
	.assets li + li,
	.tags li + li {
		border-top: 1px solid var(--border);
	}
	.assets .muted {
		margin-left: auto;
		font-size: 0.8rem;
	}
	.tags {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 0.92rem;
	}
	.tags li {
		padding: 0.6rem 1rem;
	}
	.tags li:not(.empty):hover {
		background: var(--surface);
	}
	.tags .name {
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--fg);
	}
	.tags .name :global(svg) {
		color: var(--muted);
	}
	.msg {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.sha {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--muted);
	}
	.when,
	.dl {
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.dl a {
		color: var(--muted);
	}
	a:hover {
		color: var(--accent) !important;
	}
	.empty {
		flex-direction: column;
		gap: 0.35rem !important;
		padding: 2.5rem 1rem !important;
		text-align: center;
		color: var(--muted);
	}
	.empty strong {
		color: var(--fg);
		font-weight: 500;
	}
</style>
