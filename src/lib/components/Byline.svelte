<script lang="ts">
	let { login, agent, bold = false }: { login: string; agent?: string; bold?: boolean } = $props();
</script>

{#if agent}<span class="agent" title="An agent acting for @{login} through forge">{agent}</span> on behalf of{' '}{/if}{#if bold}<strong>{login}</strong>{:else}{login}{/if}
