// Prints a fresh Shed session cookie value for a user (default ada), so tests skip the OIDC round trip.
import { openDb } from '../../src/lib/server/db.js';
import { startSession } from '../../src/lib/server/accounts.js';
const db = openDb(`${process.env.SHED_DATA || 'data'}/shed.db`);
const u = db.query<{ id: number }, [string]>('select id from users where login = ?').get(process.argv[2] ?? 'ada');
if (!u) throw new Error('No such user; sign in once first');
console.log(startSession(db, u.id, 'test script'));
