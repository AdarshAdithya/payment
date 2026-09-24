import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDemo } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const DB_FILE = process.env.DB_FILE || path.join(here, '..', 'payflow.db');
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('JWT_SECRET not set; using a random secret (sessions reset on restart).');
  return crypto.randomBytes(32).toString('hex');
})();

const db = openDb(DB_FILE);
if (process.env.SEED_DEMO !== '0') seedDemo(db);

const app = createApp({ db, jwtSecret: JWT_SECRET, staticDir: path.join(here, '..', '..', 'client', 'dist') });
app.listen(PORT, () => console.log(`PayFlow API listening on http://localhost:${PORT}`));
