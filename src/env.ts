import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	FORGEJO_URL: { description: 'Base URL of the Forgejo instance, without trailing slash' },
	FORGEJO_CLIENT_ID: { description: 'OAuth2 client ID registered in Forgejo' },
	FORGEJO_CLIENT_SECRET: { description: 'OAuth2 client secret registered in Forgejo' },
	FORGE_SECRET: { description: 'Random secret that encrypts stored agent credentials (e.g. `openssl rand -base64 32`)' },
	FORGE_DATA: { description: 'Directory for forge.json (agent keys and activity)', schema: (v) => v || 'data' },
	T3_URL: { description: 'Optional T3 Code server every user gets, e.g. http://localhost:3773. More hosts are added in Settings → Agents', schema: (v) => v || undefined },
	T3_TOKEN: { description: 'Bearer token from `t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope source-control:write`', schema: (v) => v || undefined }
});
