import { defineEnvVars } from '@sveltejs/kit/env';

const url = (name: string) => (v: string | undefined) => {
	const u = v && URL.parse(v);
	if (!u || !/^https?:$/.test(u.protocol)) throw new Error(`${name} must be an http(s) URL, e.g. https://git.example.com`);
	return v!.replace(/\/+$/, '');
};
const required = (name: string) => (v: string | undefined) => {
	if (!v) throw new Error(`${name} is required`);
	return v;
};

export const variables = defineEnvVars({
	FORGEJO_URL: { description: 'Base URL of the Forgejo instance, without trailing slash', schema: url('FORGEJO_URL') },
	FORGEJO_CLIENT_ID: { description: 'OAuth2 client ID registered in Forgejo', schema: required('FORGEJO_CLIENT_ID') },
	FORGEJO_CLIENT_SECRET: { description: 'OAuth2 client secret registered in Forgejo', schema: required('FORGEJO_CLIENT_SECRET') },
	FORGE_SECRET: {
		description: 'Random secret that encrypts stored agent credentials (e.g. `openssl rand -base64 32`)',
		schema: (v) => {
			if (!v || v.length < 32) throw new Error('FORGE_SECRET must be at least 32 characters; make one with `openssl rand -base64 32`');
			return v;
		}
	},
	FORGE_DATA: { description: 'Directory for forge.json (agent keys and activity)', schema: (v) => v || 'data' },
	T3_URL: { description: 'Optional T3 Code server every user gets, e.g. http://localhost:3773. More hosts are added in Settings → Agents', schema: (v) => (v ? url('T3_URL')(v) : undefined) },
	T3_TOKEN: { description: 'Bearer token from `t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope source-control:write`', schema: (v) => v || undefined }
});
