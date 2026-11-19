import { expect, test } from 'bun:test';
import { refreshRestoredNotifications } from './notification-history.js';

test('refreshes restored documents, not ordinary page shows', async () => {
	let calls = 0;
	const refresh = async () => { calls++; };
	await refreshRestoredNotifications({ persisted: false }, refresh);
	expect(calls).toBe(0);
	await refreshRestoredNotifications({ persisted: true }, refresh);
	expect(calls).toBe(1);
});
