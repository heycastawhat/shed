// The server's admin command line: `shed-admin <command>` in the container (a bundle of this file), `bun bin/shed-admin.ts <command>` from a checkout. The client CLI is cli/shed.ts.
//   import <forgejo url> [owner/repo …]   copy repos (and their owners) from Forgejo; FORGEJO_TOKEN must be a token that can read them
import { openDb } from '../src/lib/server/db.js';
import { importer } from '../src/lib/server/importer.js';

const data = process.env.SHED_DATA || 'data';
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'import') {
	const [url, ...only] = args;
	const token = process.env.FORGEJO_TOKEN;
	if (!url || !token) throw new Error('Usage: FORGEJO_TOKEN=… bun bin/shed-admin.ts import <forgejo url> [owner/repo …]');
	const db = openDb(`${data}/shed.db`);
	const n = await importer(db, data, url.replace(/\/+$/, ''), token)(only);
	console.log(`${n} repo${n === 1 ? '' : 's'} imported`);
} else {
	console.log('Commands: import <forgejo url> [owner/repo …]');
	process.exit(cmd ? 1 : 0);
}
