import { describe, expect, test } from 'bun:test';
import { parseDiff, toSplit, type Line } from './diff';

const fixture = (name: string) => Bun.file(new URL(`fixtures/${name}.diff`, import.meta.url)).text();
const nums = (lines: Line[]) => lines.map((l) => [l.kind, l.old, l.new]);

describe('parseDiff on a real commit', async () => {
	const files = parseDiff(await fixture('refactor'));

	test('finds every file with its status and paths', () => {
		expect(files.map((f) => [f.status, f.from, f.to])).toEqual([
			['modified', 'README.md', 'README.md'],
			['deleted', 'hello.py', 'hello.py'],
			['added', 'src/lib/math.ts', 'src/lib/math.ts'],
			['renamed', 'src/lib/time.ts', 'src/lib/relative-time.ts'],
			['modified', 'src/lib/server/auth.ts', 'src/lib/server/auth.ts']
		]);
		expect(files.every((f) => !f.binary)).toBe(true);
	});

	test('counts additions and deletions', () => {
		expect(files.map((f) => [f.additions, f.deletions])).toEqual([
			[1, 1],
			[0, 1],
			[1, 0],
			[0, 0],
			[4, 2]
		]);
	});

	test('a pure rename has no hunks', () => expect(files[3].hunks).toEqual([]));

	test('numbers a deleted file from old line 1 and an added file from new line 1', () => {
		expect(nums(files[1].hunks[0].lines)).toEqual([['del', 1, undefined]]);
		expect(nums(files[2].hunks[0].lines)).toEqual([['add', undefined, 1]]);
	});

	test('keeps multiple hunks with function context and their own line numbers', () => {
		const { hunks } = files[4];
		expect(hunks.map((h) => h.header)).toEqual([
			"@@ -3,6 +3,7 @@ import { FORGEJO_URL, FORGEJO_CLIENT_ID, FORGEJO_CLIENT_SECRET } from '$app/env/",
			'@@ -34,7 +35,8 @@ export function saveSession(cookies: Cookies, g: Grant) {',
			'@@ -43,7 +45,7 @@ export async function sessionToken(cookies: Cookies) {'
		]);
		expect(nums(hunks[1].lines)).toEqual([
			['ctx', 34, 35],
			['ctx', 35, 36],
			['ctx', 36, 37],
			['del', 37, undefined],
			['add', undefined, 38],
			['add', undefined, 39],
			['ctx', 38, 40],
			['ctx', 39, 41],
			['ctx', 40, 42]
		]);
		expect(hunks[1].lines[3].text).toBe("\tcookies.delete(SESSION, { path: '/' });");
		expect(hunks[2].lines.at(-1)).toEqual({ kind: 'ctx', old: 49, new: 51, text: '\t\treturn g.access_token;' });
	});
});

test('binary files are flagged and have no hunks', async () => {
	const files = parseDiff(await fixture('binary'));
	expect(files.map((f) => [f.status, f.from, f.to, f.binary, f.hunks.length])).toEqual([
		['added', 'blob.bin', 'blob.bin', true, 0],
		['added', 'logo.png', 'logo.png', true, 0]
	]);
});

test('patch headers discard tab delimiters without trimming filename spaces', () => {
	const [file] = parseDiff('diff --git a/hello world.txt b/hello world.txt\n--- a/hello world.txt\t\n+++ b/hello world.txt\t\n@@ -1 +1 @@\n-old\n+new\n');
	expect([file.from, file.to]).toEqual(['hello world.txt', 'hello world.txt']);
	expect(parseDiff('diff --git a/space  b/space \n--- a/space \t\n+++ b/space \t\n')[0].to).toBe('space ');
});

test('quoted diff paths decode tabs, quotes, backslashes and UTF-8 octal bytes', () => {
	const from = String.raw`"a/\303\251\t\"\\123.txt"`;
	const to = String.raw`"b/\303\251\t\"\\123.txt"`;
	const name = 'é\t"\\123.txt';
	for (const suffix of ['', `\n--- ${from}\n+++ ${to}\n@@ -1 +1 @@\n-a\n+b\n`]) {
		const [file] = parseDiff(`diff --git ${from} ${to}${suffix}`);
		expect([file.from, file.to]).toEqual([name, name]);
	}
	const [renamed] = parseDiff(String.raw`diff --git "a/old\tname" "b/\303\251\tname"
similarity index 100%
rename from "old\tname"
rename to "\303\251\tname"`);
	expect([renamed.status, renamed.from, renamed.to]).toEqual(['renamed', 'old\tname', 'é\tname']);
});

describe('edge cases', async () => {
	const [notes, sql, mode] = parseDiff(await fixture('edge'));

	test('"\\ No newline at end of file" is not a line', () => {
		expect(nums(notes.hunks[0].lines)).toEqual([
			['ctx', 1, 1],
			['ctx', 2, 2],
			['del', 3, undefined],
			['add', undefined, 3]
		]);
		expect([notes.additions, notes.deletions]).toEqual([1, 1]);
	});

	test('content that looks like ---/+++ headers stays in the hunk', () => {
		expect([sql.from, sql.to]).toEqual(['schema.sql', 'schema.sql']);
		expect(sql.hunks[0].lines.map((l) => [l.kind, l.text])).toEqual([
			['del', '-- old comment'],
			['add', '++ new comment'],
			['ctx', 'id INTEGER PRIMARY KEY']
		]);
	});

	test('a mode change alone is a modified file with no hunks', () => {
		expect([mode.status, mode.from, mode.to, mode.hunks.length]).toEqual(['modified', 'run.sh', 'run.sh', 0]);
	});

	test('empty input gives no files', () => expect(parseDiff('')).toEqual([]));
});

describe('toSplit', async () => {
	const auth = parseDiff(await fixture('refactor'))[4];

	test('pairs a deletion run with the additions after it and pads the shorter side', () => {
		const rows = toSplit(auth.hunks[1].lines);
		expect(rows.map((r) => [r.left?.old, r.right?.new])).toEqual([
			[34, 35],
			[35, 36],
			[36, 37],
			[37, 38],
			[undefined, 39],
			[38, 40],
			[39, 41],
			[40, 42]
		]);
		expect(rows[3].left?.kind).toBe('del');
		expect(rows[3].right?.kind).toBe('add');
	});

	test('context lines appear on both sides', () => {
		const row = toSplit(auth.hunks[0].lines)[0];
		expect(row.left).toBe(row.right!);
	});

	test('additions with no deletion before them have an empty left side', () => {
		const lines: Line[] = [
			{ kind: 'add', new: 1, text: 'a' },
			{ kind: 'del', old: 1, text: 'b' },
			{ kind: 'del', old: 2, text: 'c' },
			{ kind: 'add', new: 2, text: 'd' }
		];
		expect(toSplit(lines).map((r) => [r.left?.text, r.right?.text])).toEqual([
			[undefined, 'a'],
			['b', 'd'],
			['c', undefined]
		]);
	});
});
