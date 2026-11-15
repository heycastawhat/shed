import { defineEnvVars } from '@sveltejs/kit/env';
import { parseAllowlist } from './lib/server/accounts.js';

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
	FORGE_SECRET: {
		description: 'Random secret that encrypts stored agent credentials (e.g. `openssl rand -base64 32`)',
		schema: (v) => {
			if (!v || v.length < 32) throw new Error('FORGE_SECRET must be at least 32 characters; make one with `openssl rand -base64 32`');
			return v;
		}
	},
	SHED_OIDC_ISSUER: { description: 'OpenID Connect issuer people sign in with, e.g. https://auth.example.com', schema: url('SHED_OIDC_ISSUER') },
	SHED_OIDC_CLIENT_ID: { description: 'OIDC client ID; the redirect URI is <shed URL>/auth/callback', schema: required('SHED_OIDC_CLIENT_ID') },
	SHED_OIDC_CLIENT_SECRET: { description: 'OIDC client secret', schema: required('SHED_OIDC_CLIENT_SECRET') },
	SHED_ALLOWED_USERS: { description: 'Who may sign in: comma-separated email:…, user:… (provider username) or sub:…', schema: (v) => parseAllowlist(v).join(',') },
	SHED_DATA: { description: 'Directory for shed.db and the git repos', schema: (v) => v || 'data' },
	FORGE_DATA: { description: 'Directory for forge.json (agent keys and activity)', schema: (v) => v || 'data' },
	T3_URL: { description: 'Optional T3 Code server every user gets, e.g. http://localhost:3773. More hosts are added in Settings → Agents', schema: (v) => (v ? url('T3_URL')(v) : undefined) },
	T3_TOKEN: { description: 'Bearer token from `t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope source-control:write`', schema: (v) => v || undefined }
});
