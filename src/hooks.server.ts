import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { getUser, sessionUser, tokenAuth } from '#lib/server/accounts.js';
import { dispatch } from '#lib/server/api/index.js';
import { internalToken } from '#lib/server/api/internal.js';
import { gitHttp, isGitRequest } from '#lib/server/githttp.js';
import { db, root, startBackground, setOrigin, setSshHost } from '#lib/server/shed.js';
import { runnerRpc } from '#lib/server/actions/rpc.js';
import { actionsCtx, signingKey } from '#lib/server/actions/secrets.js';
import { artifactBlob, artifactPipeline, artifactTwirp } from '#lib/server/actions/artifacts.js';
import { sweepMentions } from '#lib/server/mention.js';
import { read } from '#lib/server/store.js';
import { isTheme } from '#lib/themes.js';

// Load forge.json and open shed.db (the import above) before serving anything, so a corrupt file stops the server instead of failing every request.
export const init: ServerInit = async () => {
	await read();
	db.query('select 1').get();
	startBackground();
};

const SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-frame-options': 'DENY'
};

export const handle: Handle = async ({ event, resolve }) => {
	setOrigin(event.url.origin);
	setSshHost(event.url.hostname);
	if (isGitRequest(event.url)) return gitHttp(db, root, event.request, event.url);
	const twirp = event.url.pathname.match(/^\/twirp\/github\.actions\.results\.api\.v1\.ArtifactService\/(\w+)$/);
	if (twirp) return artifactTwirp(db, root, event.url.origin, signingKey, event.request, twirp[1]);
	if (event.url.pathname.startsWith('/api/actions_pipeline/')) return artifactPipeline(db, root, event.url.origin, signingKey, event.request, event.url);
	if (event.url.pathname.startsWith('/_apis/shed/artifacts/')) return artifactBlob(db, root, signingKey, event.request, event.url);
	if (event.url.pathname.startsWith('/api/actions/')) return runnerRpc(actionsCtx(event.url.origin), event.request, event.url.pathname.slice('/api/actions/'.length));
	// The REST API for scripts and tools: a Shed token as `token …`, `Bearer …` or a Basic password. Cookies don't count, so no CSRF.
	if (event.url.pathname.startsWith('/api/v1/')) {
		const h = event.request.headers.get('authorization') ?? '';
		const raw = h.match(/^(?:token|bearer)\s+(.+)$/i)?.[1] ?? (h.match(/^basic\s+(.+)$/i) ? new TextDecoder().decode(Uint8Array.fromBase64(h.split(/\s+/)[1])).split(':').slice(1).join(':') : undefined);
		const t = raw ? tokenAuth(db, raw) : null;
		if (raw && !t) return new Response(JSON.stringify({ message: 'That token is unknown or expired' }), { status: 401, headers: { 'content-type': 'application/json' } });
		return dispatch(db, root, event.url.origin, event.request, { user: t ? getUser(db, t.userId) : null, token: t });
	}
	event.locals.user = sessionUser(db, event.cookies.get('shed_session')) ?? undefined;
	// Pages call Shed's API in-process as the signed-in person.
	event.locals.token = event.locals.user ? internalToken(event.locals.user.id) : undefined;
	sweepMentions();
	// Set on <html> while rendering so a chosen theme doesn't flash the OS one first.
	const theme = event.cookies.get('forge_theme');
	const palette = event.cookies.get('forge_palette');
	const attrs = (theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : '') + (isTheme(palette) ? ` data-palette="${palette}"` : '');
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="en"${attrs}>`)
	});
	for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!response.headers.has(k)) response.headers.set(k, v);
	return response;
};
