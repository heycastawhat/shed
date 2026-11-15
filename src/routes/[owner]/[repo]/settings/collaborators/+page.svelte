<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const LEVELS = [
		['read', 'Read'],
		['write', 'Write'],
		['admin', 'Admin']
	] as const;
	const keep = () => ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>Collaborators · {data.repo.full_name}</title></svelte:head>

<section>
	<h2>Collaborators</h2>
	<p class="lead">
		Who else can work on this repo; {data.repo.owner.login} always has full access.
		<strong>Read</strong> can clone and comment, <strong>Write</strong> can also push, review and merge, <strong>Admin</strong> can also change settings.
	</p>

	<form class="card add" method="POST" action="?/set" use:enhance>
		<div class="row">
			<label class="field">Login <input name="login" required placeholder="reviewer" autocomplete="off" /></label>
			<label class="field level"
				>Access
				<select name="permission">
					{#each LEVELS as [value, label] (value)}<option {value} selected={value === 'write'}>{label}</option>{/each}
				</select>
			</label>
			<button class="primary">Add</button>
		</div>
		{#if form?.action === 'set' && form.error}<p class="error" role="alert">{form.error}</p>{/if}
	</form>

	<ul class="list">
		{#each data.collaborators as c (c.login)}
			<li>
				<a class="who" href="/{c.login}"><img src={c.avatar} alt="" width="28" height="28" /><span><strong>{c.login}</strong>{#if c.name}<small>{c.name}</small>{/if}</span></a>
				<div class="actions">
					<form method="POST" action="?/set" use:enhance={keep}>
						<input type="hidden" name="login" value={c.login} />
						<select name="permission" aria-label="Access for {c.login}" value={c.permission} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
							{#each LEVELS as [value, label] (value)}<option {value}>{label}</option>{/each}
						</select>
					</form>
					<form method="POST" action="?/remove" use:enhance>
						<input type="hidden" name="login" value={c.login} />
						<button class="danger">Remove</button>
					</form>
				</div>
			</li>
		{:else}
			<li class="empty">No collaborators yet.</li>
		{/each}
	</ul>
	{#if form?.action === 'remove' && form.error}<p class="error" role="alert">{form.error}</p>{/if}
</section>

<style>
	.add {
		margin-bottom: 1rem;
	}
	.row > .level {
		flex: 0 1 9rem;
	}
	.who {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		min-width: 0;
		color: var(--fg);
	}
	.who img {
		border-radius: 50%;
		flex: none;
	}
	.who span {
		display: grid;
		min-width: 0;
	}
	.who small {
		color: var(--muted);
	}
</style>
