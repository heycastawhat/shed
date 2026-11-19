import YAML from 'yaml';
import { git, gitTry } from '../git.js';

// Reading workflow files and turning a triggered one into jobs, as Forgejo's jobparser does: one single-job workflow per job
// (and per matrix combination), which is what the runner is given.

export type Trigger = {
	event: 'push' | 'pull_request' | 'pull_request_target' | 'workflow_dispatch' | 'schedule';
	ref?: string;
	base?: string;
	action?: string;
	files?: string[];
};

const DIRS = ['.forgejo/workflows', '.gitea/workflows', '.github/workflows'];

// Workflow files at a commit: the first of .forgejo, .gitea or .github that has any.
export async function workflowFiles(dir: string, sha: string) {
	for (const d of DIRS) {
		const out = await gitTry(dir, ['ls-tree', '--name-only', `${sha}:${d}`]);
		const files = (out ?? '').split('\n').filter((f) => /\.ya?ml$/.test(f));
		if (files.length) return Promise.all(files.map(async (f) => ({ path: `${d}/${f}`, text: await git(dir, ['cat-file', 'blob', `${sha}:${d}/${f}`]) })));
	}
	return [];
}

// GitHub's filter patterns: * within a path segment, ** across them, ? one character, + one or more of the previous, ! to exclude.
function patternRe(p: string) {
	let re = '';
	for (let i = 0; i < p.length; i++) {
		const ch = p[i];
		if (ch === '*' && p[i + 1] === '*') {
			if (p[i + 2] === '/') (re += '(?:.*/)?'), i += 2;
			else (re += '.*'), i++;
		}
		else if (ch === '*') re += '[^/]*';
		else if (ch === '?') re += '[^/]';
		else if (ch === '+') re += '+';
		else if (ch === '[') {
			const end = p.indexOf(']', i);
			re += end > i ? p.slice(i, end + 1) : '\\[';
			if (end > i) i = end;
		} else re += ch.replace(/[.^$(){}|\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
}
// Later patterns win, so `!` can carve exceptions out of a broader match.
export function matches(patterns: string[], value: string) {
	let hit = false;
	for (const p of patterns) {
		if (p.startsWith('!')) {
			if (patternRe(p.slice(1)).test(value)) hit = false;
		} else if (patternRe(p).test(value)) hit = true;
	}
	return hit;
}
const list = (v: unknown) => (v === undefined || v === null ? undefined : (Array.isArray(v) ? v : [v]).map(String));

function filterOk(include: string[] | undefined, exclude: string[] | undefined, value: string) {
	if (include) return matches(include, value);
	if (exclude) return !matches(exclude, value);
	return true;
}
function pathsOk(cfg: Record<string, unknown>, files?: string[]) {
	const inc = list(cfg.paths);
	const exc = list(cfg['paths-ignore']);
	if (!files || (!inc && !exc)) return true;
	if (inc) return files.some((f) => matches(inc, f));
	return files.some((f) => !matches(exc!, f));
}

// Whether a workflow's `on:` fires for this event.
export function fires(on: unknown, t: Trigger) {
	const events: Record<string, Record<string, unknown> | null> =
		typeof on === 'string' ? { [on]: null } : Array.isArray(on) ? Object.fromEntries(on.map((e) => [String(e), null])) : ((on as Record<string, Record<string, unknown> | null>) ?? {});
	if (!(t.event in events)) return false;
	const cfg = events[t.event] ?? {};
	if (t.event === 'push') {
		const ref = t.ref ?? '';
		const tag = ref.startsWith('refs/tags/');
		const name = ref.replace(/^refs\/(heads|tags)\//, '');
		const branches = list(cfg.branches), bIgnore = list(cfg['branches-ignore']), tags = list(cfg.tags), tIgnore = list(cfg['tags-ignore']);
		// Filtering only branches means tag pushes don't fire, and the other way round.
		if (tag) {
			if (!tags && !tIgnore && (branches || bIgnore)) return false;
			if (!filterOk(tags, tIgnore, name)) return false;
		} else {
			if (!branches && !bIgnore && (tags || tIgnore)) return false;
			if (!filterOk(branches, bIgnore, name)) return false;
			if (!pathsOk(cfg, t.files)) return false;
		}
		return true;
	}
	if (t.event === 'pull_request' || t.event === 'pull_request_target') {
		const types = list(cfg.types) ?? ['opened', 'synchronize', 'reopened'];
		if (t.action && !types.includes(t.action)) return false;
		if (!filterOk(list(cfg.branches), list(cfg['branches-ignore']), t.base ?? '')) return false;
		return pathsOk(cfg, t.files);
	}
	return true;
}

type Job = Record<string, unknown> & { name?: string; needs?: string | string[]; 'runs-on'?: unknown; strategy?: { matrix?: unknown }; if?: string };
export type Workflow = Record<string, unknown> & { name?: string; on?: unknown; jobs?: Record<string, Job> };

export function parseWorkflow(text: string): Workflow {
	const w = YAML.parse(text) as Workflow;
	if (!w || typeof w !== 'object' || !w.jobs || typeof w.jobs !== 'object') throw new Error('A workflow needs a jobs: section');
	// YAML 1.1 reads a bare `on:` key as true.
	if (w.on === undefined && 'true' in w) w.on = (w as Record<string, unknown>)['true'];
	return w;
}

// Matrix combinations: the product of the axes, minus `exclude` entries, plus `include` (extending combinations it matches on
// their original axes, or adding new ones).
export function expandMatrix(matrix: unknown): Record<string, unknown>[] {
	if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return [{}];
	const m = matrix as Record<string, unknown>;
	const axes = Object.entries(m).filter(([k, v]) => k !== 'include' && k !== 'exclude' && Array.isArray(v)) as [string, unknown[]][];
	let combos: Record<string, unknown>[] = [{}];
	for (const [k, values] of axes) combos = combos.flatMap((c) => values.map((v) => ({ ...c, [k]: v })));
	if (!axes.length) combos = [];
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	for (const ex of (m.exclude as Record<string, unknown>[] | undefined) ?? []) combos = combos.filter((c) => !Object.entries(ex).every(([k, v]) => same(c[k], v)));
	const original = new Set(axes.map(([k]) => k));
	for (const inc of (m.include as Record<string, unknown>[] | undefined) ?? []) {
		const hits = combos.filter((c) => Object.entries(inc).every(([k, v]) => !original.has(k) || same(c[k], v)));
		if (hits.length && Object.keys(inc).some((k) => original.has(k) || combos.length)) for (const h of hits) Object.assign(h, Object.fromEntries(Object.entries(inc).filter(([k]) => !original.has(k) || same(h[k], inc[k]))));
		else combos.push({ ...inc });
	}
	return axes.length || (Array.isArray(m.include) && m.include.length) ? combos : [{}];
}

// The only expressions the server resolves, in a job's name and runs-on: `matrix.x`, `vars.X`, `inputs.x` (or `github.event.inputs.x`),
// a quoted string and `fromJSON(…)` of either. The runner evaluates everything else.
export type Context = { matrix?: Record<string, unknown>; vars?: Record<string, string>; inputs?: Record<string, unknown> };
function evaluate(expr: string, ctx: Context): unknown {
	const e = expr.trim();
	const ref = e.match(/^(?:(matrix|vars)|(?:github\.event\.)?(inputs))\.([\w-]+)$/);
	if (ref) return ctx[(ref[1] ?? ref[2]) as keyof Context]?.[ref[3]] ?? '';
	const quoted = e.match(/^'((?:[^']|'')*)'$/);
	if (quoted) return quoted[1].replaceAll("''", "'");
	const json = e.match(/^fromJSON\((.+)\)$/i);
	if (json) {
		try {
			return JSON.parse(String(evaluate(json[1], ctx)));
		} catch {
			return undefined;
		}
	}
	return undefined;
}
const sub = (s: string, ctx: Context) => s.replace(/\$\{\{(.+?)\}\}/g, (all, e) => String(evaluate(e, ctx) ?? all));

// runs-on as a label, a list of them, `{ labels }`, or one expression that gives either.
export function runsOn(v: unknown, ctx: Context): string[] {
	if (Array.isArray(v)) return v.flatMap((l) => runsOn(l, ctx));
	if (v && typeof v === 'object') return runsOn((v as { labels?: unknown }).labels ?? '', ctx);
	const whole = typeof v === 'string' && v.trim().match(/^\$\{\{(.+)\}\}$/s);
	if (whole && !whole[1].includes('}}')) {
		const r = evaluate(whole[1], ctx);
		if (Array.isArray(r)) return r.map(String);
		if (r !== undefined) return [String(r)];
	}
	return [sub(String(v ?? ''), ctx)];
}

export type PlannedJob = { key: string; name: string; needs: string[]; runsOn: string[]; payload: string; always: boolean };

// A dispatch's inputs over the workflow's defaults.
export function inputsOf(w: Workflow, given: unknown): Record<string, unknown> {
	const declared = (w.on as { workflow_dispatch?: { inputs?: Record<string, { default?: unknown }> } } | undefined)?.workflow_dispatch?.inputs;
	const defaults = declared && typeof declared === 'object' ? Object.fromEntries(Object.entries(declared).map(([k, d]) => [k, d?.default ?? ''])) : {};
	return { ...defaults, ...(given && typeof given === 'object' ? given : {}) };
}

export function planJobs(w: Workflow, ctx: Omit<Context, 'matrix'> = {}): PlannedJob[] {
	const top = Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'jobs' && k !== 'true'));
	const out: PlannedJob[] = [];
	for (const [key, job] of Object.entries(w.jobs ?? {})) {
		const matrix = job.strategy?.matrix;
		const combos = typeof matrix === 'string' ? [{}] : expandMatrix(matrix);
		for (const combo of combos) {
			const keys = Object.keys(combo);
			const baseName = job.name ?? key;
			const name = keys.length && !/\$\{\{\s*matrix\./.test(baseName) ? `${baseName} (${keys.map((k) => (typeof combo[k] === 'object' ? JSON.stringify(combo[k]) : String(combo[k]))).join(', ')})` : sub(baseName, { ...ctx, matrix: combo });
			const single: Job = { ...job };
			if (keys.length) single.strategy = { ...job.strategy, matrix: Object.fromEntries(keys.map((k) => [k, [combo[k]]])) };
						out.push({
				key,
				name,
				needs: (Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : []).map(String),
				runsOn: runsOn(job['runs-on'], { ...ctx, matrix: combo }),
				payload: YAML.stringify({ ...top, jobs: { [key]: single } }),
				always: /\b(always|failure|cancelled)\s*\(/.test(String(job.if ?? ''))
			});
		}
	}
	return out;
}
