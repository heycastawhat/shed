import { expect, test } from 'bun:test';
import { openDb } from './db.js';
import { publicUrl, remoteUrl, syncDueMirrors } from './mirror.js';
import { signIn } from './accounts.js';

test('remote URLs', () => {
	expect(remoteUrl('https://git.example.com/a/b.git', { token: 't0k' })).toBe('https://oauth2:t0k@git.example.com/a/b.git');
	expect(remoteUrl('https://git.example.com/a/b.git', { username: 'me', password: 'pw' })).toBe('https://me:pw@git.example.com/a/b.git');
	expect(() => remoteUrl('file:///etc')).toThrow();
	expect(() => remoteUrl('ssh://git@x/a.git')).toThrow();
	expect(publicUrl('https://me:pw@git.example.com/a/b.git')).toBe('https://git.example.com/a/b.git');
});

test('scheduled mirrors do not fetch or update archived repositories', async () => {
	const db = openDb(':memory:');
	const user = signIn(db, { sub: 'mirror', preferred_username: 'mirror' });
	db.query('insert into repos (owner_id, name, archived, mirror_url) values (?, ?, 1, ?)').run(user, 'archived', 'encrypted');
	let decrypts = 0;
	try {
		await syncDueMirrors(db, '/unused', { encrypt: async (s) => s, decrypt: async () => { decrypts++; throw new Error('Must not fetch an archived mirror'); } });
		expect(decrypts).toBe(0);
		expect(db.query('select mirror_updated_at, mirror_error from repos').get()).toEqual({ mirror_updated_at: null, mirror_error: null });
	} finally {
		db.close();
	}
});
