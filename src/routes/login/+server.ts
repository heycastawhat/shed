import { redirect } from '@sveltejs/kit';
import { cookie } from '#lib/server/auth.js';
import { authorize } from '#lib/server/oidc.js';
import { provider } from '#lib/server/shed.js';

export async function GET({ url, cookies, locals }) {
	// Pages not yet moved to Shed still send people here; signing in again wouldn't help them, so don't loop through the provider.
	if (locals.user) redirect(303, '/');
	const { url: target, pending } = await authorize(provider, `${url.origin}/auth/callback`);
	cookies.set('shed_oidc', JSON.stringify(pending), { ...cookie(url, 600), path: '/auth/callback' });
	redirect(303, target, { external: [target.origin] });
}
