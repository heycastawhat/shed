<script lang="ts">
	import { page } from '$app/state';
	import type { User } from '#lib/server/forgejo.js';
	import { listQuery } from '#lib/list-query.js';

	let { users }: { users: User[] | null } = $props();
</script>

{#if users?.length}
	<span class="stack">
		{#each users as u (u.id)}<a href={listQuery(page.url, { assignee: u.login })} title="Assigned to {u.login}"><img src={u.avatar_url} alt={u.login} /></a>{/each}
	</span>
{/if}

<style>
	.stack {
		display: inline-flex;
		flex-direction: row-reverse;
		margin-left: auto;
		align-self: center;
		flex: none;
	}
	a + a {
		margin-right: -6px;
	}
	img {
		display: block;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		box-shadow: 0 0 0 2px var(--bg);
	}
</style>
