<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Sign in to the app</title></svelte:head>

<section class="allow">
	<h1>Sign in to the Shed app?</h1>
	<p class="muted">The Android app gets a token that can read and write your repos, issues and pull requests as <strong>{data.login}</strong>. You can revoke it in Settings → Tokens.</p>
	<form method="POST" action="/login/app/allow">
		<input type="hidden" name="code_challenge" value={data.challenge} />
		<input type="hidden" name="state" value={data.state} />
		<button class="primary">Allow</button>
		<a class="button" href={data.cancel}>Cancel</a>
	</form>
</section>

<style>
	.allow {
		max-width: 28rem;
		margin: 15vh auto 0;
		display: grid;
		gap: 12px;
	}
	h1 {
		margin: 0;
	}
	form {
		display: flex;
		gap: 8px;
	}
</style>
