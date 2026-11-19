import { expect, test } from 'bun:test';
import { notificationAction } from './notification-action.js';

test('all notification mutations preserve the active filter and page', () => {
	for (const action of ['mark', 'all'] as const) {
		expect(notificationAction(new URLSearchParams('tab=all&page=2&/mark'), action)).toBe(`?/${action}&tab=all&page=2`);
		expect(notificationAction(new URLSearchParams(), action)).toBe(`?/${action}&`);
	}
});
