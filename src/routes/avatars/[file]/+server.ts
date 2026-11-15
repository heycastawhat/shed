// A letter on a colour picked from the name, for accounts without a picture.
export function GET({ params }) {
	const name = params.file.replace(/\.svg$/, '');
	const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
	const letter = Bun.escapeHTML((name[0] ?? '?').toUpperCase());
	return new Response(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 55%)"/><text x="32" y="43" font-family="system-ui,sans-serif" font-size="30" font-weight="600" text-anchor="middle" fill="#fff">${letter}</text></svg>`,
		{ headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } }
	);
}
