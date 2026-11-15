// Prints a new read/write token for a user (default ada), for git tests.
import { openDb } from '../../src/lib/server/db.js';
import { createToken } from '../../src/lib/server/accounts.js';
const db = openDb(`${process.env.SHED_DATA || 'data'}/shed.db`);
const u = db.query<{ id: number }, [string]>('select id from users where login = ?').get(process.argv[2] ?? 'ada')!;
console.log(createToken(db, u.id, { name: `test ${new Date().toISOString()}`, scopes: ['repo:read', 'repo:write'], expiresAt: new Date(Date.now() + 864e5).toISOString() }));
