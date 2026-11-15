import { error } from '@sveltejs/kit';
import { gitTry } from './git.js';
import type { Change } from './write.js';

// One file operation in a multi-file commit, in Forgejo's ChangeFiles shape. `sha` is the blob the client last saw (a stale edit is refused);
// `from_path` on an update renames or moves the file.
export type FileOp = { operation: 'create' | 'update' | 'delete'; path: string; content?: string; sha?: string; from_path?: string };

export function checkPath(path: unknown) {
	if (typeof path !== 'string' || !path || path.length > 4096 || /[\0-\x1f\\]/.test(path) || path.split('/').some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git'))
		error(422, `Invalid path: ${String(path)}`);
	return path;
}

type Entry = { mode: string; type: string; sha: string };

// What's at `path` in `commit` (null if nothing), read from the parent folder's listing so no part of the path is taken as a pattern.
async function entryAt(dir: string, commit: string | null, path: string): Promise<Entry | null> {
	if (!commit) return null;
	const i = path.lastIndexOf('/');
	const out = await gitTry(dir, ['ls-tree', '-z', i < 0 ? commit : `${commit}:${path.slice(0, i)}`]);
	const name = path.slice(i + 1);
	for (const l of out?.split('\0') ?? []) {
		const tab = l.indexOf('\t');
		if (l.slice(tab + 1) !== name) continue;
		const [mode, type, sha] = l.slice(0, tab).split(' ');
		return { mode, type, sha };
	}
	return null;
}

// A new file can't sit where a folder is, or inside something that's a file.
async function blocked(dir: string, commit: string | null, path: string) {
	const parts = path.split('/');
	for (let i = 1; i < parts.length; i++) {
		const e = await entryAt(dir, commit, parts.slice(0, i).join('/'));
		if (!e) return null;
		if (e.type !== 'tree') return parts.slice(0, i).join('/');
	}
	return null;
}

function decode(content: string | undefined, path: string) {
	try {
		return Uint8Array.fromBase64(content ?? '') as Uint8Array<ArrayBuffer>;
	} catch {
		error(400, `${path}: content must be base64`);
	}
}

// Checks every operation against `parent` and turns them into the changes commitFiles takes.
export async function planChanges(dir: string, parent: string | null, ops: FileOp[]): Promise<Change[]> {
	if (!Array.isArray(ops) || !ops.length) error(422, 'Nothing to commit');
	const changes: Change[] = [];
	const touched = new Set<string>();
	const touch = (p: string) => {
		if (touched.has(p)) error(422, `${p} is changed twice`);
		touched.add(p);
	};
	for (const op of ops) {
		const path = checkPath(op?.path);
		const from = op.operation === 'update' && op.from_path && op.from_path !== path ? checkPath(op.from_path) : null;
		const cur = await entryAt(dir, parent, from ?? path);
		const file = cur && cur.type === 'blob' ? cur : null;
		if (op.operation === 'create') {
			if (cur) error(422, `${path} already exists`);
		} else if (op.operation === 'update' || op.operation === 'delete') {
			if (!file) error(404, `${from ?? path} doesn't exist`);
			if (op.sha && op.sha !== file.sha) error(409, `${from ?? path} changed since you opened it`);
		} else error(422, `Unknown operation: ${String(op.operation)}`);
		if (op.operation === 'delete') {
			touch(path);
			changes.push({ path, content: null });
			continue;
		}
		if (from && (await entryAt(dir, parent, path))) error(422, `${path} already exists`);
		const block = await blocked(dir, parent, path);
		if (block) error(422, `${block} is a file, so ${path} can't go inside it`);
		touch(path);
		changes.push({ path, content: decode(op.content, path), mode: file?.mode === '100755' ? '100755' : '100644' });
		if (from) {
			touch(from);
			changes.push({ path: from, content: null });
		}
	}
	return changes;
}
