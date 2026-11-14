import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),
			// Scripts only: Shiki and the theme CSS use inline styles, and markdown images can come from anywhere.
			csp: {
				mode: 'auto',
				directives: { 'script-src': ['self'], 'object-src': ['none'], 'base-uri': ['self'], 'frame-ancestors': ['none'] }
			}
		})
	]
});
