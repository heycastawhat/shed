export class GitError extends Error {
	constructor(
		readonly args: string[],
		readonly code: number,
		readonly stderr: string
	) {
		super(`git ${args[0]} failed (${code}): ${stderr.trim() || 'no output'}`);
	}
}

// Arguments go in as an array, never through a shell, and the user's and system's git config are ignored so neither can change what a command does.
export const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
// Paths come back unquoted (UTF-8 names stay as they are).
const CONFIG = ['-c', 'core.quotePath=false'];

type Input = string | Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;

export function spawn(args: string[], input?: Input, env: Record<string, string> = {}) {
	return Bun.spawn(['git', ...CONFIG, ...args], {
		stdin: input === undefined ? 'ignore' : input instanceof ReadableStream ? input : new Blob([input]),
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...ENV, ...env }
	});
}

async function run(args: string[], input?: Input) {
	const proc = spawn(args, input);
	const [out, err, code] = await Promise.all([new Response(proc.stdout).bytes(), new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new GitError(args[0] === '--git-dir' ? args.slice(2) : args, code, err);
	return out;
}

export const gitBytes = (dir: string, args: string[], input?: Input) => run(['--git-dir', dir, ...args], input);
export const git = async (dir: string, args: string[], input?: Input) => new TextDecoder().decode(await gitBytes(dir, args, input));

// Like git(), but a non-zero exit (a missing ref or path, usually) gives null instead of throwing.
export const gitTry = (dir: string, args: string[], input?: Input) => git(dir, args, input).catch((e) => (e instanceof GitError ? null : Promise.reject(e)));

export const initBare = (dir: string, branch: string) => run(['init', '--quiet', '--bare', `--initial-branch=${branch}`, dir]);
