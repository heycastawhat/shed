<script lang="ts">
	import type { Label, Milestone, User } from '#lib/server/forgejo.js';
	import LabelChip from './LabelChip.svelte';
	import SidePicker from './SidePicker.svelte';

	// `list` is the issue or PR list that chips and names link to as filters.
	let {
		item,
		options,
		can,
		list
	}: {
		item: { labels: Label[]; assignees: User[] | null; milestone: Milestone | null };
		options: { labels: Label[]; assignees: User[]; milestones: Milestone[] };
		can: boolean;
		list: string;
	} = $props();
	const labelIds = $derived(new Set(item.labels.map((l) => l.id)));
	const assigned = $derived((item.assignees ?? []).map((a) => a.login));
	const m = $derived(item.milestone);
	const done = $derived(m && m.open_issues + m.closed_issues ? Math.round((100 * m.closed_issues) / (m.open_issues + m.closed_issues)) : 0);
	const date = (d: string) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

{#snippet chips()}
	<div class="chips">{#each item.labels as l (l.id)}<a href="{list}?labels={encodeURIComponent(l.name)}"><LabelChip label={l} /></a>{/each}</div>
{/snippet}
{#snippet people()}
	<ul class="people">
		{#each item.assignees ?? [] as a (a.id)}
			<li><a href="{list}?assignee={encodeURIComponent(a.login)}"><img src={a.avatar_url} alt="" />{a.login}</a></li>
		{/each}
	</ul>
{/snippet}
{#snippet milestone()}
	{#if m}
		<a class="ms" href="{list}?milestone={encodeURIComponent(m.title)}">{m.title}</a>
		<div class="bar" title="{done}% complete"><span style="width: {done}%"></span></div>
		<p class="muted small">{[`${done}%`, `${m.open_issues} open`, m.due_on && `due ${date(m.due_on)}`, m.state === 'closed' && 'closed'].filter(Boolean).join(' · ')}</p>
	{/if}
{/snippet}

<div class="triage">
	<SidePicker
		title="Labels"
		icon="tag"
		action="label"
		{can}
		options={options.labels}
		on={(l) => labelIds.has(l.id)}
		fields={(l) => [['id', l.id], ...(labelIds.has(l.id) ? [['remove', ''] as [string, string]] : [])]}
		empty={options.labels.length ? 'None yet' : 'This repo has no labels'}
		shown={item.labels.length ? chips : undefined}
	>
		{#snippet row(l)}
			<LabelChip label={l} />
			{#if l.description}<span class="muted desc">{l.description}</span>{/if}
		{/snippet}
	</SidePicker>
	<SidePicker
		title="Assignees"
		icon="user"
		action="assign"
		{can}
		options={options.assignees}
		on={(u) => assigned.includes(u.login)}
		fields={(u) => [['login', u.login], ...(assigned.includes(u.login) ? [['remove', ''] as [string, string]] : [])]}
		empty="No one"
		shown={assigned.length ? people : undefined}
	>
		{#snippet row(u)}
			<img class="avatar" src={u.avatar_url} alt="" />{u.login}
			{#if u.full_name}<span class="muted">{u.full_name}</span>{/if}
		{/snippet}
	</SidePicker>
	<SidePicker
		title="Milestone"
		icon="milestone"
		action="milestone"
		{can}
		options={options.milestones}
		on={(o) => o.id === m?.id}
		fields={(o) => [['id', o.id === m?.id ? 0 : o.id]]}
		single
		empty={options.milestones.length ? 'None' : 'This repo has no open milestones'}
		shown={m ? milestone : undefined}
	>
		{#snippet row(o)}
			{o.title}
			{#if o.due_on}<span class="muted small">due {date(o.due_on)}</span>{/if}
		{/snippet}
	</SidePicker>
</div>

<style>
	.triage {
		display: grid;
		gap: 1.25rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.desc {
		flex-basis: 100%;
		padding-left: calc(14px + 0.4rem);
		font-size: 0.75rem;
	}
	.people {
		display: grid;
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.people a,
	.ms {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--fg);
		font-size: 0.9rem;
	}
	.people a:hover,
	.ms:hover {
		color: var(--accent);
	}
	.people img,
	.avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}
	.ms {
		font-weight: 500;
	}
	.bar {
		height: 6px;
		margin: 0.4rem 0 0.3rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.small {
		margin: 0;
		font-size: 0.75rem;
	}
</style>
