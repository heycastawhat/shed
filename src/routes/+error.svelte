<script lang="ts">
	import { page } from '$app/state';

	// A 500 is a bug or an outage, and its message can be internal; everything else is a message meant for the user.
	const message = $derived(page.status === 500 ? 'Something went wrong on our side. Try again in a moment.' : page.error?.message);
	const title = $derived(page.status === 404 ? 'Not found' : page.status === 401 || page.status === 403 ? 'Not allowed' : page.status >= 500 ? 'Something broke' : 'Error');
</script>

<svelte:head><title>{title} · forge</title></svelte:head>

<section>
	<p class="status">{page.status}</p>
	<h1>{title}</h1>
	{#if message}<p class="message">{message}</p>{/if}
	<p class="links">
		<a href="/">Home</a>
		{#if page.status === 401}<a href="/login">Log in</a>{/if}
	</p>
</section>

<style>
	section {
		max-width: 32rem;
		margin: 15vh auto;
		padding: 0 1rem;
		text-align: center;
	}
	.status {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		margin: 0;
	}
	h1 {
		margin: 0.25rem 0 0.75rem;
	}
	.message {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.links {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}
</style>
