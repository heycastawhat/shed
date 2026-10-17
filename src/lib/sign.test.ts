import { expect, test } from 'bun:test';
import { bodyAgent, commitAgent, sign, unsign } from './sign';

test('sign then unsign round-trips the body and agent name', () => {
	const body = 'Fixed the off-by-one.\n\nSee `retry.ts`.';
	const signed = sign(body, 'Claude Code', 'ada');
	expect(signed).toBe(`${body}\n\n<sub>Claude Code, an agent acting for @ada via forge</sub>`);
	expect(unsign(signed)).toEqual({ body, agent: 'Claude Code' });
	expect(unsign(signed + '\n  ')).toEqual({ body, agent: 'Claude Code' });
});

test('unsign leaves unsigned or mid-body footers alone', () => {
	expect(unsign('plain comment')).toEqual({ body: 'plain comment' });
	const quoted = '<sub>bot, an agent acting for @ada via forge</sub>\n\nbut then a reply';
	expect(unsign(quoted)).toEqual({ body: quoted });
	expect(unsign('x\n\n<sub>bot, an agent acting for @ada via elsewhere</sub>').agent).toBeUndefined();
});

test('bodyAgent recognises forge signatures and the Claude Code footer', () => {
	expect(bodyAgent(sign('hi', 'reviewer-bot', 'ada'))).toBe('reviewer-bot');
	expect(bodyAgent('## Summary\n- thing\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')).toBe('Claude Code');
	expect(bodyAgent('I generated this with Claude Code by hand')).toBeUndefined();
	expect(bodyAgent('')).toBeUndefined();
});

test('commitAgent reads the Anthropic co-author trailer in any case', () => {
	expect(commitAgent('Fix thing\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')).toBe('Claude Opus 4.7');
	expect(commitAgent('Fix thing\n\nco-authored-by:   Claude  <noreply@anthropic.com>  \nSigned-off-by: Ada <j@x>')).toBe('Claude');
	expect(commitAgent('Fix thing\n\nCO-AUTHORED-BY: Claude Sonnet <NOREPLY@ANTHROPIC.COM>')).toBe('Claude Sonnet');
});

test('commitAgent ignores other co-authors and mentions mid-line', () => {
	expect(commitAgent('Fix\n\nCo-Authored-By: Ada <owner@example.com>')).toBeUndefined();
	expect(commitAgent('Mention Co-Authored-By: Claude <noreply@anthropic.com> in docs')).toBeUndefined();
	expect(commitAgent('Fix\n\nCo-Authored-By: Claude <noreply@anthropic.com.evil>')).toBeUndefined();
	expect(commitAgent('Plain commit')).toBeUndefined();
});
