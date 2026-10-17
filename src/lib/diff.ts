export type Line = { kind: 'add' | 'del' | 'ctx'; old?: number; new?: number; text: string; html?: string };
// `line` is "new:N" or "old:N", the same keys line comments use.
export type Draft = { path: string; line: string; body: string };
export type Hunk = { header: string; lines: Line[] };
export type FileDiff = {
	from: string;
	to: string;
	status: 'added' | 'deleted' | 'renamed' | 'modified';
	binary: boolean;
	additions: number;
	deletions: number;
	hunks: Hunk[];
};

const strip = (p: string) => (p === '/dev/null' ? p : p.replace(/^[ab]\//, ''));

export function parseDiff(diff: string): FileDiff[] {
	const files: FileDiff[] = [];
	let file: FileDiff | undefined;
	let hunk: Hunk | undefined;
	let oldNo = 0;
	let newNo = 0;

	for (const line of diff.split('\n')) {
		if (line.startsWith('diff --git ')) {
			// Paths here are ambiguous when they contain spaces; ---/+++ or rename lines override them.
			const m = line.match(/^diff --git a\/(.*) b\/(.*)$/);
			file = { from: m?.[1] ?? '', to: m?.[2] ?? '', status: 'modified', binary: false, additions: 0, deletions: 0, hunks: [] };
			files.push(file);
			hunk = undefined;
		} else if (!file) {
			continue;
		} else if (hunk && /^[ +-]/.test(line)) {
			const kind = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'ctx';
			const text = line.slice(1);
			if (kind === 'add') hunk.lines.push({ kind, new: newNo++, text }), file.additions++;
			else if (kind === 'del') hunk.lines.push({ kind, old: oldNo++, text }), file.deletions++;
			else hunk.lines.push({ kind, old: oldNo++, new: newNo++, text });
		} else if (line.startsWith('@@')) {
			const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
			oldNo = Number(m?.[1] ?? 0);
			newNo = Number(m?.[2] ?? 0);
			hunk = { header: line, lines: [] };
			file.hunks.push(hunk);
		} else if (line.startsWith('--- ')) file.from = strip(line.slice(4));
		else if (line.startsWith('+++ ')) file.to = strip(line.slice(4));
		else if (line.startsWith('new file mode')) file.status = 'added';
		else if (line.startsWith('deleted file mode')) file.status = 'deleted';
		else if (line.startsWith('rename from ')) (file.from = line.slice(12)), (file.status = 'renamed');
		else if (line.startsWith('rename to ')) file.to = line.slice(10);
		else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true;
	}

	for (const f of files) {
		if (f.from === '/dev/null') f.from = f.to;
		if (f.to === '/dev/null') f.to = f.from;
	}
	return files;
}

export type SplitRow = { left?: Line; right?: Line };

// Pairs each run of deletions with the additions that follow it, so changed lines sit side by side.
export function toSplit(lines: Line[]): SplitRow[] {
	const rows: SplitRow[] = [];
	for (let i = 0; i < lines.length; ) {
		if (lines[i].kind === 'ctx') {
			rows.push({ left: lines[i], right: lines[i] });
			i++;
			continue;
		}
		const dels: Line[] = [];
		const adds: Line[] = [];
		while (i < lines.length && lines[i].kind === 'del') dels.push(lines[i++]);
		while (i < lines.length && lines[i].kind === 'add') adds.push(lines[i++]);
		for (let j = 0; j < Math.max(dels.length, adds.length); j++) rows.push({ left: dels[j], right: adds[j] });
	}
	return rows;
}
