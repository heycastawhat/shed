import { expect, test } from 'bun:test';
import { mentionsAgent, withoutMention } from './mention';

test('finds @agent as a word', () => {
	for (const s of ['@agent fix this', 'hey @agent, look', 'thanks @agent.', '(@agent)', 'line one\n@agent: go']) expect(mentionsAgent(s)).toBe(true);
});

test('ignores lookalikes and emails', () => {
	for (const s of ['@agents fix this', '@agent-bot', '@agent_x', 'mail me@agent.dev', 'ada@agent', '@agent.dev', 'no mention', 'agent please'])
		expect(mentionsAgent(s)).toBe(false);
});

test('ignores code spans, fenced blocks and quotes', () => {
	for (const s of ['run `@agent` here', 'run ``a ` @agent`` here', '```\n@agent do it\n```', '~~~ts\n@agent\n~~~', '> @agent do it\n\nI disagree', '```\nunclosed @agent'])
		expect(mentionsAgent(s)).toBe(false);
	expect(mentionsAgent('`code` then @agent do it')).toBe(true);
	expect(mentionsAgent('```\nx\n```\n@agent after the block')).toBe(true);
});

test('withoutMention drops the mention and keeps code', () => {
	expect(withoutMention('@agent, add a line `@agent` to x')).toBe('add a line `@agent` to x');
	expect(withoutMention('please @agent rename it')).toBe('please rename it');
	expect(withoutMention('@agents stay')).toBe('@agents stay');
});
