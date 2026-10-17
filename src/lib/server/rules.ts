import { isHttpError, error } from '@sveltejs/kit';
import { api, request } from './forgejo.js';

// A repo's own limits for agents, versioned with the code: `.forge/agents.json` on the default branch.
export type Rules = {
	branchPrefix?: string;
	protectedPaths?: string[];
	ask?: string[];
	deny?: string[];
};

export const RULES_PATH = '.forge/agents.json';

export async function loadRules(token: string, repo: string): Promise<Rules> {
	let raw: string;
	try {
		raw = await (await request(token, `/repos/${repo}/raw/${RULES_PATH}`)).text();
	} catch (e) {
		if (isHttpError(e) && e.status === 404) return {};
		throw e;
	}
	// Fail closed: a broken rules file blocks writes rather than silently dropping the limits.
	try {
		const r = JSON.parse(raw);
		const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
		if (r.branchPrefix !== undefined && typeof r.branchPrefix !== 'string') throw 0;
		for (const k of ['protectedPaths', 'ask', 'deny']) if (r[k] !== undefined && !strings(r[k])) throw 0;
		return r;
	} catch {
		error(422, `${RULES_PATH} in ${repo} is invalid, so agent writes are blocked until it is fixed`);
	}
}

const glob = (g: string) =>
	new RegExp(
		'^' +
			g
				.replace(/[.+^${}()|[\]\\]/g, '\\$&')
				.replace(/\*\*\//g, '\u0000')
				.replace(/\*\*/g, '\u0001')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '[^/]')
				.replace(/\u0000/g, '(?:.*/)?')
				.replace(/\u0001/g, '.*') +
			'$'
	);

export const touching = (files: string[], globs: string[] = []) => files.filter((f) => globs.some((g) => glob(g).test(f)));

// Files a branch would change relative to base, or undefined when this Forgejo doesn't report them.
export async function changedFiles(token: string, repo: string, base: string | undefined, head: string) {
	const b = base ?? (await api<{ default_branch: string }>(token, `/repos/${repo}`)).default_branch;
	const c = await api<{ files?: { filename: string }[] }>(token, `/repos/${repo}/compare/${encodeURIComponent(b)}...${encodeURIComponent(head)}`);
	return c.files?.map((f) => f.filename);
}
