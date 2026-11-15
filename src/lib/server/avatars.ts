import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';
import { mkdir, rm } from 'node:fs/promises';

export const AVATAR_MAX = 1024 * 1024;

// The type comes from the bytes, never the name or the upload's content type, so nothing but an image is ever served from /avatars.
export function sniff(b: Uint8Array) {
	const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
	if (b[0] === 0x89 && at(1, 'PNG\r\n\x1a\n')) return 'image/png';
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'image/gif';
	if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
	return null;
}

export const avatarFile = (root: string, id: number) => `${root}/avatars/${id}`;
// Uploaded avatars are the only ones under /avatars/ (a provider's picture is a full URL), which is how sign-in knows to keep them.
export const isUploaded = (url: string) => url.startsWith('/avatars/');

export async function saveAvatar(db: Database, root: string, userId: number, bytes: Uint8Array) {
	if (bytes.length > AVATAR_MAX) error(413, 'Avatars can be up to 1 MB');
	if (!sniff(bytes)) error(422, 'Use a PNG, JPEG, WebP or GIF image');
	await mkdir(`${root}/avatars`, { recursive: true });
	await Bun.write(avatarFile(root, userId), bytes);
	db.query('update users set avatar_url = ? where id = ?').run(`/avatars/${userId}.img?v=${Date.now().toString(36)}`, userId);
}

export async function removeAvatar(db: Database, root: string, userId: number) {
	await rm(avatarFile(root, userId), { force: true });
	db.query("update users set avatar_url = '' where id = ? and avatar_url like '/avatars/%'").run(userId);
}
