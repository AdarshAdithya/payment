import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL UNIQUE,
  email           TEXT,
  upi_id          TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  pin_attempts    INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT,
  wallet_balance  INTEGER NOT NULL DEFAULT 0,
  avatar_color    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  ifsc            TEXT NOT NULL,
  balance         INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_primary      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT NOT NULL,
  name            TEXT NOT NULL,
  input_label     TEXT NOT NULL,
  input_pattern   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT PRIMARY KEY,
  utr               TEXT NOT NULL UNIQUE,
  kind              TEXT NOT NULL CHECK (kind IN ('p2p','bill','topup','cashback')),
  payer_id          INTEGER REFERENCES users(id),
  payee_id          INTEGER REFERENCES users(id),
  amount            INTEGER NOT NULL CHECK (amount > 0),
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'success',
  source_type       TEXT,
  source_account_id INTEGER REFERENCES bank_accounts(id),
  dest_type         TEXT,
  dest_account_id   INTEGER REFERENCES bank_accounts(id),
  biller_id         INTEGER REFERENCES billers(id),
  consumer_number   TEXT,
  category          TEXT NOT NULL DEFAULT 'transfer',
  idempotency_key   TEXT,
  created_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_idem ON transactions(payer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_txn_payer ON transactions(payer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_txn_payee ON transactions(payee_id, created_at);

CREATE TABLE IF NOT EXISTS splits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id  INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  total       INTEGER NOT NULL CHECK (total > 0),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS money_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id    INTEGER NOT NULL REFERENCES users(id),
  payer_id        INTEGER NOT NULL REFERENCES users(id),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','declined','cancelled')),
  split_id        INTEGER REFERENCES splits(id),
  transaction_id  TEXT REFERENCES transactions(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  transaction_id  TEXT REFERENCES transactions(id),
  amount          INTEGER NOT NULL DEFAULT 0,
  scratched       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  scratched_at    TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
`;

const BILLERS = [
  ['mobile', 'Jio Prepaid', 'Mobile number', '^[6-9]\\d{9}$'],
  ['mobile', 'Airtel Prepaid', 'Mobile number', '^[6-9]\\d{9}$'],
  ['mobile', 'Vi Prepaid', 'Mobile number', '^[6-9]\\d{9}$'],
  ['electricity', 'BESCOM Bangalore', 'Account ID', '^\\d{10}$'],
  ['electricity', 'Tata Power Mumbai', 'Consumer number', '^\\d{12}$'],
  ['electricity', 'Adani Electricity', 'Consumer number', '^\\d{9}$'],
  ['dth', 'Tata Play', 'Subscriber ID', '^\\d{10}$'],
  ['dth', 'Airtel Digital TV', 'Customer ID', '^\\d{10}$'],
  ['broadband', 'ACT Fibernet', 'Account number', '^\\d{6,10}$'],
  ['broadband', 'JioFiber', 'Service ID', '^\\d{10,12}$'],
  ['water', 'BWSSB Bangalore', 'RR number', '^[A-Z0-9]{6,12}$'],
  ['gas', 'Indane Gas', 'Consumer number', '^\\d{8,12}$'],
  ['fastag', 'ICICI FASTag', 'Vehicle number', '^[A-Z]{2}\\d{1,2}[A-Z]{1,3}\\d{4}$'],
  ['creditcard', 'HDFC Credit Card', 'Card number (last 4)', '^\\d{4}$'],
];

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM billers').get();
  if (n === 0) {
    const ins = db.prepare('INSERT INTO billers (category, name, input_label, input_pattern) VALUES (?, ?, ?, ?)');
    for (const b of BILLERS) ins.run(...b);
  }
  return db;
}

/** Run fn inside a write transaction; rolls back on any thrown error. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
