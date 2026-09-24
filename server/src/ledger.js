import crypto from 'node:crypto';
import {
  ApiError, badRequest, notFound, now, txnId, utr, verifySecret,
  DAILY_LIMIT_PAISE, formatINR, maskAccount,
} from './util.js';
import { transaction } from './db.js';

const PIN_MAX_ATTEMPTS = 3;
const PIN_LOCK_MINUTES = 15;

export function getUser(db, id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw notFound('User not found');
  return u;
}

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    upiId: u.upi_id,
    avatarColor: u.avatar_color,
  };
}

export function selfUser(u) {
  return {
    ...publicUser(u),
    phone: u.phone,
    email: u.email,
    walletBalance: u.wallet_balance,
    createdAt: u.created_at,
  };
}

/**
 * Verify a UPI PIN. Wrong attempts are counted and persisted *outside* any
 * surrounding payment transaction so a failed payment can't roll them back.
 */
export function verifyPin(db, userId, pin) {
  const u = getUser(db, userId);
  if (u.pin_locked_until && new Date(u.pin_locked_until) > new Date()) {
    throw new ApiError(423, 'pin_locked', 'Too many wrong PIN attempts. Try again later.', { lockedUntil: u.pin_locked_until });
  }
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) throw badRequest('Enter your UPI PIN', 'pin_required');
  if (!verifySecret(pin, u.pin_hash)) {
    const attempts = u.pin_attempts + 1;
    if (attempts >= PIN_MAX_ATTEMPTS) {
      const until = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString();
      db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = ? WHERE id = ?').run(until, userId);
      throw new ApiError(423, 'pin_locked', `Incorrect PIN. UPI PIN locked for ${PIN_LOCK_MINUTES} minutes.`, { lockedUntil: until });
    }
    db.prepare('UPDATE users SET pin_attempts = ? WHERE id = ?').run(attempts, userId);
    throw new ApiError(401, 'wrong_pin', `Incorrect UPI PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt(s) left.`, { attemptsLeft: PIN_MAX_ATTEMPTS - attempts });
  }
  if (u.pin_attempts || u.pin_locked_until) {
    db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = ?').run(userId);
  }
}

export function notify(db, userId, type, title, body, link = null) {
  db.prepare('INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, type, title, body, link, now());
}

function primaryAccount(db, userId) {
  return db.prepare('SELECT * FROM bank_accounts WHERE user_id = ? AND is_active = 1 ORDER BY is_primary DESC, id ASC LIMIT 1').get(userId);
}

/** Resolve a source spec ('wallet' | accountId) for a user and debit it. */
function debit(db, userId, source, amount) {
  if (source === 'wallet') {
    const r = db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND wallet_balance >= ?').run(amount, userId, amount);
    if (r.changes !== 1) throw new ApiError(402, 'insufficient_funds', 'Insufficient wallet balance');
    return { type: 'wallet', accountId: null };
  }
  const accountId = Number(source);
  if (!Number.isInteger(accountId)) throw badRequest('Choose a payment source', 'invalid_source');
  const acct = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND user_id = ? AND is_active = 1').get(accountId, userId);
  if (!acct) throw badRequest('Bank account not found', 'invalid_source');
  const r = db.prepare('UPDATE bank_accounts SET balance = balance - ? WHERE id = ? AND balance >= ?').run(amount, accountId, amount);
  if (r.changes !== 1) throw new ApiError(402, 'insufficient_funds', `Insufficient balance in ${acct.bank_name} ${maskAccount(acct.account_number)}`);
  return { type: 'bank', accountId };
}

/** Credit a user's primary bank account, falling back to their wallet. */
function credit(db, userId, amount, { toWallet = false } = {}) {
  const acct = toWallet ? null : primaryAccount(db, userId);
  if (acct) {
    db.prepare('UPDATE bank_accounts SET balance = balance + ? WHERE id = ?').run(amount, acct.id);
    return { type: 'bank', accountId: acct.id };
  }
  db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, userId);
  return { type: 'wallet', accountId: null };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function enforceDailyLimit(db, userId, amount) {
  const { spent } = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions WHERE payer_id = ? AND kind IN ('p2p','bill') AND status = 'success' AND created_at >= ?",
  ).get(userId, startOfToday());
  if (spent + amount > DAILY_LIMIT_PAISE) {
    throw new ApiError(422, 'daily_limit', `Daily limit of ${formatINR(DAILY_LIMIT_PAISE)} reached. You can send ${formatINR(Math.max(0, DAILY_LIMIT_PAISE - spent))} more today.`);
  }
}

function insertTxn(db, t) {
  const row = {
    id: txnId(), utr: utr(), note: null, status: 'success', source_type: null, source_account_id: null,
    dest_type: null, dest_account_id: null, biller_id: null, consumer_number: null, category: 'transfer',
    idempotency_key: null, payer_id: null, payee_id: null, created_at: now(),
  };
  for (const [k, v] of Object.entries(t)) row[k] = v ?? null;
  db.prepare(`INSERT INTO transactions
    (id, utr, kind, payer_id, payee_id, amount, note, status, source_type, source_account_id, dest_type, dest_account_id,
     biller_id, consumer_number, category, idempotency_key, created_at)
    VALUES (:id, :utr, :kind, :payer_id, :payee_id, :amount, :note, :status, :source_type, :source_account_id, :dest_type,
     :dest_account_id, :biller_id, :consumer_number, :category, :idempotency_key, :created_at)`).run(row);
  return row.id;
}

function findIdempotent(db, userId, key) {
  if (!key) return null;
  return db.prepare('SELECT id FROM transactions WHERE payer_id = ? AND idempotency_key = ?').get(userId, key)?.id ?? null;
}

function checkIdemKey(key) {
  if (key == null) return null;
  if (typeof key !== 'string' || key.length < 8 || key.length > 64) throw badRequest('Invalid idempotency key');
  return key;
}

/** Scratch card for eligible payments: ₹100+ earns a card, amount decided now, revealed later. */
function maybeReward(db, userId, transactionId, amount) {
  if (amount < 100_00) return null;
  const roll = crypto.randomInt(100);
  const value = roll < 30 ? 0 : roll < 80 ? crypto.randomInt(1, 21) * 100 : roll < 97 ? crypto.randomInt(21, 76) * 100 : crypto.randomInt(76, 201) * 100;
  const r = db.prepare('INSERT INTO rewards (user_id, transaction_id, amount, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, transactionId, value, now());
  return Number(r.lastInsertRowid);
}

export function resolvePayee(db, handle) {
  if (typeof handle !== 'string' || !handle.trim()) throw badRequest('Enter a UPI ID or phone number', 'payee_required');
  const h = handle.trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE lower(upi_id) = ? OR phone = ?').get(h, h);
  if (!u) throw notFound('No PayFlow user found with that UPI ID or number');
  return u;
}

export function sendMoney(db, payerId, { to, amount, note, source, pin, idempotencyKey, requestId = null }) {
  const key = checkIdemKey(idempotencyKey);
  const existing = findIdempotent(db, payerId, key);
  if (existing) return { transactionId: existing, rewardId: null, replayed: true };

  const payee = typeof to === 'number' ? getUser(db, to) : resolvePayee(db, to);
  if (payee.id === payerId) throw badRequest('You cannot pay yourself', 'self_payment');
  verifyPin(db, payerId, pin);

  const payer = getUser(db, payerId);
  return transaction(db, () => {
    enforceDailyLimit(db, payerId, amount);
    const src = debit(db, payerId, source, amount);
    const dst = credit(db, payee.id, amount);
    const id = insertTxn(db, {
      kind: 'p2p', payer_id: payerId, payee_id: payee.id, amount, note,
      source_type: src.type, source_account_id: src.accountId, dest_type: dst.type, dest_account_id: dst.accountId,
      idempotency_key: key,
    });
    if (requestId) {
      const r = db.prepare("UPDATE money_requests SET status = 'paid', transaction_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(id, now(), requestId);
      if (r.changes !== 1) throw new ApiError(409, 'request_closed', 'This request is no longer pending');
    }
    notify(db, payee.id, 'credit', `Received ${formatINR(amount)}`, `${payer.name} paid you${note ? ` for "${note}"` : ''}`, `/txn/${id}`);
    const rewardId = maybeReward(db, payerId, id, amount);
    if (rewardId) notify(db, payerId, 'reward', 'You won a scratch card!', `For paying ${payee.name}. Scratch it to reveal your reward.`, '/rewards');
    return { transactionId: id, rewardId, replayed: false };
  });
}

export function payBill(db, userId, { biller, consumerNumber, amount, source, pin, idempotencyKey, planName }) {
  const key = checkIdemKey(idempotencyKey);
  const existing = findIdempotent(db, userId, key);
  if (existing) return { transactionId: existing, rewardId: null, replayed: true };
  verifyPin(db, userId, pin);
  return transaction(db, () => {
    enforceDailyLimit(db, userId, amount);
    const src = debit(db, userId, source, amount);
    const id = insertTxn(db, {
      kind: 'bill', payer_id: userId, amount, note: planName || `${biller.name} bill`,
      source_type: src.type, source_account_id: src.accountId, biller_id: biller.id,
      consumer_number: consumerNumber, category: biller.category, idempotency_key: key,
    });
    notify(db, userId, 'bill', `${biller.name} payment successful`, `${formatINR(amount)} paid for ${consumerNumber}`, `/txn/${id}`);
    const rewardId = maybeReward(db, userId, id, amount);
    return { transactionId: id, rewardId, replayed: false };
  });
}

export function topUpWallet(db, userId, { accountId, amount, pin }) {
  verifyPin(db, userId, pin);
  return transaction(db, () => {
    const src = debit(db, userId, accountId, amount);
    db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, userId);
    const id = insertTxn(db, {
      kind: 'topup', payer_id: userId, payee_id: userId, amount, note: 'Added to PayFlow wallet',
      source_type: src.type, source_account_id: src.accountId, dest_type: 'wallet', category: 'wallet',
    });
    return { transactionId: id };
  });
}

export function scratchReward(db, userId, rewardId) {
  return transaction(db, () => {
    const r = db.prepare('SELECT * FROM rewards WHERE id = ? AND user_id = ?').get(rewardId, userId);
    if (!r) throw notFound('Reward not found');
    if (r.scratched) return { ...r, alreadyScratched: true };
    db.prepare('UPDATE rewards SET scratched = 1, scratched_at = ? WHERE id = ?').run(now(), rewardId);
    let transactionId = null;
    if (r.amount > 0) {
      db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(r.amount, userId);
      transactionId = insertTxn(db, {
        kind: 'cashback', payee_id: userId, amount: r.amount, note: 'Scratch card cashback',
        dest_type: 'wallet', category: 'cashback',
      });
    }
    return { ...db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId), transactionId };
  });
}

const TXN_SELECT = `
  SELECT t.*,
    pr.name AS payer_name, pr.upi_id AS payer_upi, pr.avatar_color AS payer_color,
    pe.name AS payee_name, pe.upi_id AS payee_upi, pe.avatar_color AS payee_color,
    b.name AS biller_name,
    sa.bank_name AS source_bank, sa.account_number AS source_acct,
    da.bank_name AS dest_bank, da.account_number AS dest_acct
  FROM transactions t
  LEFT JOIN users pr ON pr.id = t.payer_id
  LEFT JOIN users pe ON pe.id = t.payee_id
  LEFT JOIN billers b ON b.id = t.biller_id
  LEFT JOIN bank_accounts sa ON sa.id = t.source_account_id
  LEFT JOIN bank_accounts da ON da.id = t.dest_account_id`;

export function txnView(row, meId) {
  let direction;
  let counterparty;
  if (row.kind === 'topup') {
    direction = 'self';
    counterparty = { name: 'PayFlow Wallet', type: 'wallet' };
  } else if (row.kind === 'cashback') {
    direction = 'credit';
    counterparty = { name: 'PayFlow Rewards', type: 'rewards' };
  } else if (row.kind === 'bill') {
    direction = 'debit';
    counterparty = { name: row.biller_name, type: 'biller', category: row.category, reference: row.consumer_number };
  } else {
    const outgoing = row.payer_id === meId;
    direction = outgoing ? 'debit' : 'credit';
    counterparty = outgoing
      ? { id: row.payee_id, name: row.payee_name, upiId: row.payee_upi, avatarColor: row.payee_color, type: 'user' }
      : { id: row.payer_id, name: row.payer_name, upiId: row.payer_upi, avatarColor: row.payer_color, type: 'user' };
  }
  const mine = row.payer_id === meId;
  const acctLabel = (bank, num) => (bank ? `${bank} ${maskAccount(num)}` : 'PayFlow Wallet');
  return {
    id: row.id,
    utr: row.utr,
    kind: row.kind,
    direction,
    amount: row.amount,
    note: row.note,
    status: row.status,
    category: row.category,
    counterparty,
    account: direction === 'credit' && !mine
      ? acctLabel(row.dest_bank, row.dest_acct)
      : row.source_type ? acctLabel(row.source_bank, row.source_acct) : acctLabel(row.dest_bank, row.dest_acct),
    from: row.kind === 'p2p' ? { name: row.payer_name, upiId: row.payer_upi } : null,
    to: row.kind === 'p2p' ? { name: row.payee_name, upiId: row.payee_upi } : null,
    createdAt: row.created_at,
  };
}

export function getTxn(db, id, meId) {
  const row = db.prepare(`${TXN_SELECT} WHERE t.id = ? AND (t.payer_id = ? OR t.payee_id = ?)`).get(id, meId, meId);
  if (!row) throw notFound('Transaction not found');
  const view = txnView(row, meId);
  const reward = db.prepare('SELECT id, amount, scratched FROM rewards WHERE transaction_id = ? AND user_id = ?').get(id, meId);
  if (reward) view.reward = { id: reward.id, scratched: !!reward.scratched, amount: reward.scratched ? reward.amount : null };
  return view;
}

export function listTxns(db, meId, { filter = 'all', q = '', limit = 50, before = null, withUser = null } = {}) {
  const where = ['(t.payer_id = :me OR t.payee_id = :me)'];
  const params = { me: meId, limit: Math.min(Math.max(Number(limit) || 50, 1), 200) };
  if (filter === 'sent') where.push("t.kind = 'p2p' AND t.payer_id = :me");
  else if (filter === 'received') where.push("((t.kind = 'p2p' AND t.payee_id = :me) OR t.kind = 'cashback')");
  else if (filter === 'bills') where.push("t.kind = 'bill'");
  else if (filter === 'wallet') where.push("t.kind IN ('topup','cashback')");
  if (withUser) {
    where.push("t.kind = 'p2p' AND (t.payer_id = :other OR t.payee_id = :other)");
    params.other = Number(withUser);
  }
  if (q) {
    where.push('(pr.name LIKE :q OR pe.name LIKE :q OR b.name LIKE :q OR t.note LIKE :q OR t.utr LIKE :q OR pr.upi_id LIKE :q OR pe.upi_id LIKE :q)');
    params.q = `%${String(q).slice(0, 50)}%`;
  }
  if (before) {
    where.push('t.created_at < :before');
    params.before = String(before);
  }
  const rows = db.prepare(`${TXN_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT :limit`).all(params);
  return rows.map((r) => txnView(r, meId));
}
