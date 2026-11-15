<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import FileEditor from '#lib/components/FileEditor.svelte';
	import { refPath } from '#lib/repo.js';

	let { data, form } = $props();
	const dir = $derived(page.params.path ?? '');
</script>

<svelte:head><title>New file · {data.repo.full_name}</title></svelte:head>

{#if dir}<Breadcrumbs repo={data.repo.full_name} ref={data.ref} path={dir} />{/if}
<FileEditor isNew ref={data.ref} path={dir ? `${dir}/` : ''} login={data.user?.login ?? 'patch'} error={form?.error} cancel="/{data.repo.full_name}/tree/{refPath(data.ref, dir)}" />
