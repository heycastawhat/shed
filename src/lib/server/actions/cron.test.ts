import { expect, test } from 'bun:test';
import { parseCron } from './cron.js';

const at = (s: string) => new Date(`${s}Z`);
test('cron', () => {
	expect(parseCron('*/15 * * * *')(at('2026-11-15T10:30:00'))).toBe(true);
	expect(parseCron('*/15 * * * *')(at('2026-11-15T10:31:00'))).toBe(false);
	expect(parseCron('0 3 * * 1-5')(at('2026-11-16T03:00:00'))).toBe(true);
	expect(parseCron('0 3 * * 1-5')(at('2026-11-15T03:00:00'))).toBe(false);
	expect(parseCron('0 0 1 jan *')(at('2027-01-01T00:00:00'))).toBe(true);
	expect(parseCron('30 12 15 * sun')(at('2026-11-15T12:30:00'))).toBe(true);
	expect(parseCron('30 12 14 * mon')(at('2026-11-15T12:30:00'))).toBe(false);
	expect(() => parseCron('61 * * * *')).toThrow();
	expect(() => parseCron('* * *')).toThrow();
});
