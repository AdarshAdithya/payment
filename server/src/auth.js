import express from 'express';
import jwt from 'jsonwebtoken';
import { ApiError, badRequest, hashSecret, verifySecret, now, randomColor, requireString } from './util.js';
import { getUser, selfUser, verifyPin } from './ledger.js';
import { transaction } from './db.js';

const TOKEN_TTL = '7d';
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILS = 5;

export function requireAuth(secret) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new ApiError(401, 'unauthenticated', 'Please log in'));
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      req.userId = Number(payload.sub);
      next();
    } catch {
      next(new ApiError(401, 'unauthenticated', 'Session expired. Please log in again.'));
    }
  };
}

const validPhone = (p) => typeof p === 'string' && /^[6-9]\d{9}$/.test(p);
const validPin = (p) => typeof p === 'string' && /^\d{4}$|^\d{6}$/.test(p);

export function createDefaultAccount(db, userId, balance = 25000_00) {
  const acct = String(Math.floor(1e11 + Math.random() * 9e11));
  db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, ifsc, balance, is_primary, created_at)
              VALUES (?, 'PayFlow Bank', ?, 'PFLW0001234', ?, 1, ?)`).run(userId, acct, balance, now());
}

export function createUser(db, { name, phone, email, password, pin, walletBalance = 500_00, bankBalance = 25000_00 }) {
  return transaction(db, () => {
    const r = db.prepare(`INSERT INTO users (name, phone, email, upi_id, password_hash, pin_hash, wallet_balance, avatar_color, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(name, phone, email || null, `${phone}@payflow`, hashSecret(password), hashSecret(pin), walletBalance, randomColor(), now());
    const id = Number(r.lastInsertRowid);
    createDefaultAccount(db, id, bankBalance);
    return id;
  });
}

export function authRouter(db, secret) {
  const r = express.Router();
  const fails = new Map(); // key -> { count, first }
  const sign = (id) => jwt.sign({ sub: String(id) }, secret, { algorithm: 'HS256', expiresIn: TOKEN_TTL });

  r.post('/register', (req, res) => {
    const { name, phone, email, password, pin } = req.body || {};
    const cleanName = requireString(name, 'Name', { min: 2, max: 60 });
    if (!validPhone(phone)) throw badRequest('Enter a valid 10-digit mobile number', 'invalid_phone');
    if (email != null && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email', 'invalid_email');
    if (typeof password !== 'string' || password.length < 8) throw badRequest('Password must be at least 8 characters', 'weak_password');
    if (!validPin(pin)) throw badRequest('UPI PIN must be 4 or 6 digits', 'invalid_pin');
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
      throw new ApiError(409, 'phone_taken', 'An account with this number already exists');
    }
    const id = createUser(db, { name: cleanName, phone, email, password, pin });
    res.status(201).json({ token: sign(id), user: selfUser(getUser(db, id)) });
  });

  r.post('/login', (req, res) => {
    const { phone, password } = req.body || {};
    const key = `${req.ip}|${phone}`;
    const f = fails.get(key);
    if (f && Date.now() - f.first < LOGIN_WINDOW_MS && f.count >= LOGIN_MAX_FAILS) {
      throw new ApiError(429, 'rate_limited', 'Too many failed attempts. Try again in a few minutes.');
    }
    const u = validPhone(phone) ? db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) : null;
    if (!u || typeof password !== 'string' || !verifySecret(password, u.password_hash)) {
      const cur = f && Date.now() - f.first < LOGIN_WINDOW_MS ? f : { count: 0, first: Date.now() };
      cur.count += 1;
      fails.set(key, cur);
      throw new ApiError(401, 'invalid_credentials', 'Incorrect mobile number or password');
    }
    fails.delete(key);
    res.json({ token: sign(u.id), user: selfUser(u) });
  });

  return r;
}

export function meRouter(db) {
  const r = express.Router();

  r.get('/', (req, res) => {
    const u = getUser(db, req.userId);
    const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0').get(req.userId).n;
    const pendingRequests = db.prepare("SELECT COUNT(*) AS n FROM money_requests WHERE payer_id = ? AND status = 'pending'").get(req.userId).n;
    const unscratched = db.prepare('SELECT COUNT(*) AS n FROM rewards WHERE user_id = ? AND scratched = 0').get(req.userId).n;
    res.json({ user: selfUser(u), counts: { unread, pendingRequests, unscratched } });
  });

  r.patch('/', (req, res) => {
    const { name, email } = req.body || {};
    const u = getUser(db, req.userId);
    const newName = name != null ? requireString(name, 'Name', { min: 2, max: 60 }) : u.name;
    let newEmail = u.email;
    if (email !== undefined) {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email', 'invalid_email');
      newEmail = email || null;
    }
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(newName, newEmail, req.userId);
    res.json({ user: selfUser(getUser(db, req.userId)) });
  });

  r.post('/pin', (req, res) => {
    const { currentPin, newPin } = req.body || {};
    verifyPin(db, req.userId, currentPin);
    if (!validPin(newPin)) throw badRequest('New UPI PIN must be 4 or 6 digits', 'invalid_pin');
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashSecret(newPin), req.userId);
    res.json({ ok: true });
  });

  r.post('/password', (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const u = getUser(db, req.userId);
    if (typeof currentPassword !== 'string' || !verifySecret(currentPassword, u.password_hash)) {
      throw new ApiError(401, 'invalid_credentials', 'Current password is incorrect');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw badRequest('Password must be at least 8 characters', 'weak_password');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(newPassword), req.userId);
    res.json({ ok: true });
  });

  return r;
}
