import { parseDiff } from '#lib/diff.js';
import { request } from './forgejo.js';
import { highlightDiff } from './highlight.js';

export async function loadDiff(token: string | undefined, path: string) {
	return highlightDiff(parseDiff(await (await request(token, path)).text()));
}
