<script lang="ts">
	let { label }: { label: { name: string; color: string; description?: string } } = $props();
</script>

<!-- Forgejo returns the colour without its "#". Mixing it with --muted/--fg keeps pale and dark colours readable on either background. -->
<span class="label" style="--c: #{label.color.replace('#', '')}" title={label.description || undefined}>{label.name}</span>

<style>
	.label {
		display: inline-block;
		padding: 0 0.5rem;
		border: 1px solid color-mix(in srgb, var(--c) 60%, var(--muted));
		border-radius: 999px;
		background: color-mix(in srgb, var(--c) 22%, transparent);
		color: color-mix(in srgb, var(--c) 40%, var(--fg));
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.5;
		white-space: nowrap;
	}
</style>
