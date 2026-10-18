<script lang="ts">
	let { login, agent, href, bold = false }: { login: string; agent?: string; href?: string; bold?: boolean } = $props();
</script>

{#if agent}<svelte:element this={href ? 'a' : 'span'} class="agent" {href} title="An agent acting for @{login} through forge">{agent}</svelte:element> on behalf of{' '}{/if}{#if bold}<strong>{login}</strong>{:else}{login}{/if}
