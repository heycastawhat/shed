<script lang="ts">
	import { enhance } from '$app/forms';

	// Shared by Settings → Account and an org's settings; both pages have `profile`, `avatar` and `removeAvatar` actions.
	type Profile = { full_name: string; description: string; website: string; location: string };
	type Result = { action?: string; error?: string; saved?: boolean } | null | undefined;
	let { profile, avatar, uploaded, login, org = false, form }: { profile: Profile; avatar: string; uploaded: boolean; login: string; org?: boolean; form: Result } = $props();
	const msg = (action: string) => (form?.action === action ? form : null);
	let busy = $state(false);
</script>

<div class="profile">
	<form
		class="avatar"
		method="POST"
		action="?/avatar"
		enctype="multipart/form-data"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<img class:square={org} src={avatar} alt="" />
		<div class="buttons">
			<label class="button" class:busy
				>{busy ? 'Uploading…' : 'Upload a picture'}<input
					type="file"
					name="avatar"
					accept="image/png,image/jpeg,image/webp,image/gif"
					onchange={(e) => e.currentTarget.files?.length && e.currentTarget.form?.requestSubmit()}
				/></label
			>
			{#if uploaded}<button formaction="?/removeAvatar">Remove</button>{/if}
		</div>
		<small class="muted">PNG, JPEG, WebP or GIF, up to 1 MB</small>
		{#if msg('avatar')?.error}<p class="error" role="alert">{msg('avatar')?.error}</p>{/if}
	</form>

	<form class="fields" method="POST" action="?/profile" use:enhance={() => ({ update }) => update({ reset: false })}>
		<label>Display name <input name="full_name" value={profile.full_name} maxlength="100" placeholder={login} /></label>
		<label
			>{org ? 'Description' : 'Bio'}
			<textarea name="description" rows="3" maxlength="255" placeholder={org ? 'What the organization is for' : 'A line or two about you'}>{profile.description}</textarea></label
		>
		<label>Website <input name="website" type="text" inputmode="url" value={profile.website} placeholder="https://example.com" /></label>
		<label>Location <input name="location" value={profile.location} maxlength="50" /></label>
		<div class="actions">
			<button class="primary">Save profile</button>
			{#if msg('profile')?.error}<p class="error" role="alert">{msg('profile')?.error}</p>{:else if msg('profile')}<p class="muted" role="status">Saved</p>{/if}
		</div>
	</form>
</div>

<style>
	.profile {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1.5rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.avatar {
		display: grid;
		gap: 0.6rem;
		justify-items: center;
		align-content: start;
		width: 10rem;
		text-align: center;
	}
	img {
		width: 8rem;
		aspect-ratio: 1;
		border-radius: 50%;
		border: 1px solid var(--border);
		object-fit: cover;
	}
	img.square {
		border-radius: 12px;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
	}
	.button {
		cursor: pointer;
	}
	.button.busy {
		opacity: 0.6;
	}
	.button input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.button:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	small {
		font-size: 0.8rem;
	}
	.fields {
		display: grid;
		gap: 0.8rem;
		align-content: start;
	}
	.fields label {
		display: grid;
		gap: 0.3rem;
	}
	input,
	textarea {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
	textarea {
		resize: vertical;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.actions p,
	.error {
		margin: 0;
	}
	.error {
		color: var(--del-fg);
		font-size: 0.85rem;
	}
	@media (max-width: 700px) {
		.profile {
			grid-template-columns: minmax(0, 1fr);
		}
		.avatar {
			width: auto;
		}
	}
</style>
