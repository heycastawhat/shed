// Agents sign what they write through forge's MCP server so the PR page can mark it. This is a label, not proof: anyone can type the same text.
export const sign = (body: unknown, name: string, login: string) => `${body}\n\n<sub>${name}, an agent acting for @${login} via forge</sub>`;

export function unsign(body: string): { body: string; agent?: string } {
	const m = body.match(/\n*<sub>([^<\n]+), an agent acting for @[\w.-]+ via forge<\/sub>\s*$/);
	return m ? { body: body.slice(0, m.index), agent: m[1] } : { body };
}
