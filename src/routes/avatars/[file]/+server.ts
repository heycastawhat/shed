import { avatarFile, sniff } from '#lib/server/avatars.js';
import { db, root } from '#lib/server/shed.js';

// `<user id>.img` is an uploaded avatar (its URL carries a version, so it can be cached for good); `<login>.svg`, or an upload that's gone,
// is a letter on a colour picked from the name.
export async function GET({ params }) {
	const id = params.file.match(/^(\d+)\.img$/)?.[1];
	if (!id) return letter(params.file.replace(/\.svg$/, ''));
	const bytes = await Bun.file(avatarFile(root, Number(id)))
		.bytes()
		.catch(() => null);
	const type = bytes && sniff(bytes);
	if (!bytes || !type) return letter(db.query<{ login: string }, [number]>('select login from users where id = ?').get(Number(id))?.login ?? '?');
	return new Response(bytes, {
		headers: { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable', 'content-security-policy': "default-src 'none'; sandbox" }
	});
}

function letter(name: string) {
	const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
	const ch = Bun.escapeHTML((name[0] ?? '?').toUpperCase());
	return new Response(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 55%)"/><text x="32" y="43" font-family="system-ui,sans-serif" font-size="30" font-weight="600" text-anchor="middle" fill="#fff">${ch}</text></svg>`,
		{ headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } }
	);
}
