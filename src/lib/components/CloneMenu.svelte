<script lang="ts">
	import Icon from './Icon.svelte';

	let { repo, ref, https, ssh }: { repo: string; ref: string; https: string; ssh: string } = $props();
	let menu = $state<HTMLDetailsElement>();
	// svelte-ignore state_referenced_locally
	let proto = $state<'https' | 'ssh'>('https');
	let copied = $state('');
	const url = $derived(proto === 'ssh' && ssh ? ssh : https);
	const cmd = $derived(`git clone ${url}`);

	async function copy(text: string, what: string) {
		await navigator.clipboard.writeText(text);
		copied = what;
		setTimeout(() => (copied = ''), 1500);
	}
</script>

<svelte:window onclick={(e) => menu?.open && !menu.contains(e.target as Node) && (menu.open = false)} onkeydown={(e) => e.key === 'Escape' && menu && (menu.open = false)} />

<details class="clone" bind:this={menu}>
	<summary><Icon name="code" size={14} />Clone<Icon name="chevron" size={12} /></summary>
	<div class="menu">
		<div class="protos" role="group" aria-label="Clone over">
			<button class:on={proto === 'https'} onclick={() => (proto = 'https')}>HTTPS</button>
			{#if ssh}<button class:on={proto === 'ssh'} onclick={() => (proto = 'ssh')}>SSH</button>{/if}
		</div>
		<div class="row">
			<input readonly value={url} aria-label="Clone URL" onfocus={(e) => e.currentTarget.select()} />
			<button class="copy" onclick={() => copy(url, 'url')} title="Copy URL" aria-label="Copy URL"><Icon name={copied === 'url' ? 'check' : 'copy'} size={14} /></button>
		</div>
		<div class="row">
			<input readonly value={cmd} aria-label="Clone command" onfocus={(e) => e.currentTarget.select()} />
			<button class="copy" onclick={() => copy(cmd, 'cmd')} title="Copy command" aria-label="Copy command"><Icon name={copied === 'cmd' ? 'check' : 'copy'} size={14} /></button>
		</div>
		{#if proto === 'https'}<p class="muted">Use a personal access token as the password.</p>{/if}
		<hr />
		<a href="/{repo}/archive/{encodeURIComponent(ref)}.zip" download><Icon name="zip" size={14} />Download ZIP</a>
		<a href="/{repo}/archive/{encodeURIComponent(ref)}.tar.gz" download><Icon name="download" size={14} />Download TAR.GZ</a>
	</div>
</details>

<style>
	.clone {
		position: relative;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.65rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		filter: brightness(1.1);
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.35rem);
		z-index: 20;
		display: grid;
		gap: 0.5rem;
		width: min(24rem, calc(100vw - 2rem));
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
		font-size: 0.85rem;
	}
	.protos {
		display: flex;
		gap: 0.3rem;
	}
	.protos button {
		padding: 0.1rem 0.6rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.protos button.on {
		color: var(--accent);
		border-color: var(--accent);
	}
	.row {
		display: flex;
		gap: 0.3rem;
	}
	.row input {
		flex: 1;
		min-width: 0;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.8rem;
	}
	.copy {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.45rem;
	}
	p {
		margin: 0;
		font-size: 0.78rem;
	}
	hr {
		width: 100%;
		margin: 0.2rem 0;
		border: 0;
		border-top: 1px solid var(--border);
	}
	a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.4rem;
		border-radius: 6px;
		color: var(--fg);
	}
	a:hover {
		background: color-mix(in srgb, var(--fg) 9%, transparent);
	}
</style>
