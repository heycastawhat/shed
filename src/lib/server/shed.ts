import { mkdirSync } from 'node:fs';
import { SHED_ALLOWED_USERS, SHED_DATA, SHED_OIDC_CLIENT_ID, SHED_OIDC_CLIENT_SECRET, SHED_OIDC_ISSUER } from '$app/env/private';
import { openDb } from './db.js';
import './activity.js';
import './actions/runs.js';

// The one database and data folder for this process. Opened on import, so a bad database stops the server at startup (hooks' init imports it).
mkdirSync(SHED_DATA, { recursive: true });
export const root = SHED_DATA;
export const db = openDb(`${SHED_DATA}/shed.db`);
export const provider = { issuer: SHED_OIDC_ISSUER, clientId: SHED_OIDC_CLIENT_ID, clientSecret: SHED_OIDC_CLIENT_SECRET };
export const allowlist = SHED_ALLOWED_USERS.split(',');

// The address people reach Shed at, from the latest request (Shed serves one host), for links the API puts in its responses.
let current = 'http://localhost';
export const origin = () => current;
export const setOrigin = (o: string) => (current = o);
