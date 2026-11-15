// The registry is served from the hook (hooks.server.ts); this route exists so Kit doesn't redirect /v2/ to /v2, which registry clients
// don't expect.
export const trailingSlash = 'ignore';
export const fallback = () => new Response('Not found', { status: 404 });
