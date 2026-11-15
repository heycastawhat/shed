import { SHED_ACTIONS_URL, SHED_RUNNER_TOKEN } from '$app/env/private';
import { db, root } from '../shed.js';
import { decrypt } from '../store.js';
import type { Ctx } from './rpc.js';

// Secrets are stored encrypted with FORGE_SECRET and only decrypted into a task's payload.
async function secrets(repoId: number) {
	const rows = db.query<{ name: string; value: string }, [number]>('select name, value from action_secrets where repo_id = ?').all(repoId);
	return Object.fromEntries(await Promise.all(rows.map(async (r) => [r.name, await decrypt(r.value)])));
}

export const actionsCtx = (origin: string): Ctx => ({ db, root, origin, secrets, defaultActionsUrl: SHED_ACTIONS_URL, registrationToken: SHED_RUNNER_TOKEN });
