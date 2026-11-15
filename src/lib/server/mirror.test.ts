import { expect, test } from 'bun:test';
import { publicUrl, remoteUrl } from './mirror.js';

test('remote URLs', () => {
	expect(remoteUrl('https://git.example.com/a/b.git', { token: 't0k' })).toBe('https://oauth2:t0k@git.example.com/a/b.git');
	expect(remoteUrl('https://git.example.com/a/b.git', { username: 'me', password: 'pw' })).toBe('https://me:pw@git.example.com/a/b.git');
	expect(() => remoteUrl('file:///etc')).toThrow();
	expect(() => remoteUrl('ssh://git@x/a.git')).toThrow();
	expect(publicUrl('https://me:pw@git.example.com/a/b.git')).toBe('https://git.example.com/a/b.git');
});
