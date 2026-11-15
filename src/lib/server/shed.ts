import { mkdirSync } from 'node:fs';
import { SHED_ALLOWED_USERS, SHED_DATA, SHED_OIDC_CLIENT_ID, SHED_OIDC_CLIENT_SECRET, SHED_OIDC_ISSUER } from '$app/env/private';
import { openDb } from './db.js';

// The one database and data folder for this process. Opened on import, so a bad database stops the server at startup (hooks' init imports it).
mkdirSync(SHED_DATA, { recursive: true });
export const root = SHED_DATA;
export const db = openDb(`${SHED_DATA}/shed.db`);
export const provider = { issuer: SHED_OIDC_ISSUER, clientId: SHED_OIDC_CLIENT_ID, clientSecret: SHED_OIDC_CLIENT_SECRET };
export const allowlist = SHED_ALLOWED_USERS.split(',');
