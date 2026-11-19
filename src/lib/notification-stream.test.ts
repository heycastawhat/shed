import { expect, test } from 'bun:test';
import { watchNotifications } from './notification-stream.js';

test('skips initial connection, refreshes on reconnect and mentions, closes on teardown', () => {
	const stream = new EventTarget();
	let calls = 0, closed = false;
	const stop = watchNotifications(Object.assign(stream, { close: () => { closed = true; } }), async () => { calls++; });
	expect(calls).toBe(0);
	stream.dispatchEvent(new Event('error'));
	expect(calls).toBe(0);
	stream.dispatchEvent(new Event('ready'));
	expect(calls).toBe(0);
	stream.dispatchEvent(new Event('notification'));
	expect(calls).toBe(1);
	stream.dispatchEvent(new Event('ready'));
	expect(calls).toBe(2);
	stop();
	expect(closed).toBe(true);
});
