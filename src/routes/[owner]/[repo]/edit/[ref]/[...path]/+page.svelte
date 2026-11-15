<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import FileEditor from '#lib/components/FileEditor.svelte';
	import { refPath } from '#lib/repo.js';

	let { data, form } = $props();
	const path = $derived(page.params.path ?? '');
</script>

<svelte:head><title>Editing {path} · {data.repo.full_name}</title></svelte:head>

<Breadcrumbs repo={data.repo.full_name} ref={data.ref} {path} />
<FileEditor ref={data.ref} {path} text={data.text} sha={data.sha} login={data.user?.login ?? 'patch'} error={form?.error} cancel="/{data.repo.full_name}/blob/{refPath(data.ref, path)}" />
