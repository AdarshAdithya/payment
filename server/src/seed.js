import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createUser } from './auth.js';
import { sendMoney } from './ledger.js';
import { now } from './util.js';

export const DEMO_USERS = [
  { name: 'Aarav Mehta', phone: '9876543210', email: 'aarav@example.com' },
  { name: 'Priya Sharma', phone: '9876500001', email: 'priya@example.com' },
  { name: 'Rohan Iyer', phone: '9876500002', email: 'rohan@example.com' },
  { name: 'Ananya Reddy', phone: '9876500003', email: 'ananya@example.com' },
  { name: 'Kabir Singh', phone: '9876500004', email: 'kabir@example.com' },
];
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_PIN = '1234';

/** Seeds demo users and some history, only if the database has no users. */
export function seedDemo(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  const ids = DEMO_USERS.map((u) => createUser(db, { ...u, password: DEMO_PASSWORD, pin: DEMO_PIN }));
  const acct = (id) => db.prepare('SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1').get(id).id;
  const [aarav, priya, rohan, ananya, kabir] = ids;
  const history = [
    [priya, aarav, 450_00, 'Dinner at Truffles'],
    [aarav, rohan, 1200_00, 'Movie tickets'],
    [ananya, aarav, 250_00, 'Coffee'],
    [aarav, kabir, 3000_00, 'Rent share'],
    [rohan, aarav, 600_00, 'Cab'],
    [aarav, priya, 180_00, 'Chai & snacks'],
  ];
  for (const [from, to, amount, note] of history) {
    sendMoney(db, from, { to, amount, note, source: acct(from), pin: DEMO_PIN });
  }
  // Spread seeded history over the past few days so the timeline looks real.
  const rows = db.prepare('SELECT id FROM transactions ORDER BY created_at').all();
  rows.forEach((r, i) => {
    const d = new Date(Date.now() - (rows.length - i) * 7 * 3600_000);
    db.prepare('UPDATE transactions SET created_at = ? WHERE id = ?').run(d.toISOString(), r.id);
  });
  const t = now();
  db.prepare(`INSERT INTO money_requests (requester_id, payer_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(kabir, aarav, 350_00, 'Groceries', t, t);
  db.prepare(`INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, 'request', ?, ?, '/requests', ?)`)
    .run(aarav, 'Kabir Singh requested ₹350', 'Groceries', t);
  return true;
}

// `npm run seed` resets the local database and seeds fresh demo data.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = process.env.DB_FILE || path.join(here, '..', 'payflow.db');
  if (process.argv.includes('--reset')) for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  const db = openDb(file);
  console.log(seedDemo(db) ? `Seeded demo data into ${file}` : 'Database already has users; nothing to seed.');
}
