// The project has no @types/node; this declares only what the agent store uses.
declare module 'node:fs/promises' {
	export function readFile(path: string, encoding: 'utf8'): Promise<string>;
	export function writeFile(path: string, data: string, options?: { mode?: number }): Promise<void>;
	export function rename(from: string, to: string): Promise<void>;
	export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
}
