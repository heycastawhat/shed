// Code (fenced blocks, inline spans) and quoted lines are skipped, so a mention inside them is someone else's text, not a request.
// The mention alternative comes last: where code starts, the code match wins and swallows it.
const PARTS = /(?:^|\n)(`{3,}|~{3,})[\s\S]*?(?:\n\1|$)|(`+)[\s\S]*?[^`]\2(?!`)|(?:^|\n)>[^\n]*|(?<![\w.@/-])@agent(?![\w-]|\.\w)/g;

export const mentionsAgent = (body: string) => [...body.matchAll(PARTS)].some((m) => m[0] === '@agent');

// The comment as a task: mentions out, code and quotes kept.
export const withoutMention = (body: string) =>
	body
		.replace(PARTS, (m) => (m === '@agent' ? '' : m))
		.replace(/^[\s,:]+/, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
