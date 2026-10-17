<script lang="ts">
	import Icon from './Icon.svelte';

	let { state }: { state: string } = $props();
</script>

<span class="state {state}">
	<Icon name={state === 'open' ? 'issue' : 'done'} size={14} />
	{state}
</span>

<style>
	.state {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.6rem 0.1rem 0.45rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: capitalize;
		white-space: nowrap;
		border: 1px solid transparent;
	}
	.open {
		background: var(--accent);
		color: var(--bg);
	}
	.closed {
		color: var(--del-fg);
		border-color: var(--del-fg);
	}
</style>
