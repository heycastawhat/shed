// Code (fenced blocks, inline spans) and quoted lines are skipped, so a mention inside them is someone else's text, not a request.
// The mention alternative comes last: where code starts, the code match wins and swallows it.
const PARTS = /(?:^|\n)(`{3,}|~{3,})[\s\S]*?(?:\n\1|$)|(`+)[\s\S]*?[^`]\2(?!`)|(?:^|\n)>[^\n]*|(?<![\w.@/-])@agent\.*(?![\w.@-])/g;

type AccountMention = (login: string) => boolean;

const invokesAgent = (part: string, account?: AccountMention) =>
	part.startsWith('@agent') && (part === '@agent' || !account?.(part.slice(1)));

export const mentionsAgent = (body: string, account?: AccountMention) => [...body.matchAll(PARTS)].some((m) => invokesAgent(m[0], account));

// The comment as a task: mentions out, code and quotes kept.
export const withoutMention = (body: string, account?: AccountMention) =>
	body
		.replace(PARTS, (m) => (invokesAgent(m, account) ? m.slice('@agent'.length) : m))
		.replace(/^[\s,:]+/, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
