// Top-level paths that are pages, not owners. A login or org can't take one of these names.
export const RESERVED = new Set([
	'', 'changes', 'settings', 'login', 'logout', 'auth', 'mcp', 'pin', 'prefs', 'palette.json', 'repos', 'new', 'agents', 'explore', 'notifications', 'search',
	'orgs', 'healthz', 'avatars', 'api', 'admin', 'assets', 'static', 'user', 'users', 'issues', 'pulls', 'favicon.ico', 'robots.txt', '_app'
]);
