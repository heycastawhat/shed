import { internalToken } from './api/internal.js';

// Secure follows the request so plain-http dev and LAN setups still get cookies; behind the TLS proxy url.protocol is https.
export const cookie = (url: URL, maxAge?: number) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:', maxAge });

// An API token that acts as this person, for agent keys and background work (mentions, approvals) that run without a browser.
export async function userToken(userId: number) {
	return internalToken(userId);
}

// "Firefox on Linux", from the User-Agent, so the sessions list is recognisable.
export function describeUa(ua: string | null) {
	if (!ua) return '';
	const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
	return os ? `${browser} on ${os}` : browser;
}
