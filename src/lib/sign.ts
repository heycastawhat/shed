// Agents sign what they write through forge's MCP server so the PR page can mark it. This is a label, not proof: anyone can type the same text.
export const sign = (body: unknown, name: string, login: string) => `${body}\n\n<sub>${name}, an agent acting for @${login} via forge</sub>`;

export function unsign(body: string): { body: string; agent?: string } {
	const m = body.match(/\n*<sub>([^<\n]+), an agent acting for @[\w.-]+ via forge<\/sub>\s*$/);
	return m ? { body: body.slice(0, m.index), agent: m[1] } : { body };
}

// Agents working outside forge still mark their work: Claude Code ends PR descriptions with a "Generated with Claude Code" line
// and adds a Co-Authored-By trailer with Anthropic's noreply address to its commits.
export const bodyAgent = (body: string) => unsign(body).agent ?? (/Generated with \[Claude Code\]/.test(body) ? 'Claude Code' : undefined);
export const commitAgent = (message: string) => message.match(/^Co-Authored-By:\s*(.+?)\s*<noreply@anthropic\.com>\s*$/im)?.[1];
