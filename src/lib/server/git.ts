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
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };

async function run(args: string[], input?: string | Uint8Array<ArrayBuffer>) {
	const proc = Bun.spawn(['git', ...args], { stdin: input === undefined ? 'ignore' : new Blob([input]), stdout: 'pipe', stderr: 'pipe', env: ENV });
	const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new GitError(args[0] === '--git-dir' ? args.slice(2) : args, code, err);
	return out;
}

export const git = (dir: string, args: string[], input?: string | Uint8Array<ArrayBuffer>) => run(['--git-dir', dir, ...args], input);

export const initBare = (dir: string, branch: string) => run(['init', '--quiet', '--bare', `--initial-branch=${branch}`, dir]);
