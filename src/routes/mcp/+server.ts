import { json } from '@sveltejs/kit';
import { authenticate } from '#lib/server/agents.js';
import { call, schema, tools, usable } from '#lib/server/tools.js';

// A minimal MCP server (Streamable HTTP, JSON responses only): agents call forge's tools with a forge agent key.
export async function POST({ request: req }) {
	const ctx = await authenticate(req.headers.get('authorization'));
	const msg = await req.json().catch(() => null);
	if (!msg || Array.isArray(msg) || typeof msg.method !== 'string')
		return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Expected a single JSON-RPC request' } }, { status: 400 });
	if (msg.id === undefined) return new Response(null, { status: 202 });
	const reply = (result: unknown) => json({ jsonrpc: '2.0', id: msg.id, result });
	switch (msg.method) {
		case 'initialize':
			return reply({
				protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'forge', version: '0.1.0' },
				instructions: `You act for @${ctx.key.login} on a Forgejo host through forge. Read the repo's AGENTS.md with read_file, and its limits with get_rules, before changing anything. ${usable(ctx.key, 'merge_pull_request') ? 'You may merge with merge_pull_request when asked to. ' : "You can't merge; a human merges. "}Some actions may be queued for @${ctx.key.login}'s approval: then nothing has happened yet, so tell them and check later with check_request.`
			});
		case 'ping':
			return reply({});
		case 'tools/list':
			return reply({ tools: Object.entries(tools).filter(([name]) => usable(ctx.key, name)).map(([name, t]) => ({ name, description: t.description, inputSchema: schema(t) })) });
		case 'tools/call':
			return reply(await call(ctx, String(msg.params?.name), msg.params?.arguments ?? {}));
		default:
			return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } });
	}
}

export const GET = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
