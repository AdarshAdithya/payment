import crypto from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (msg, code = 'bad_request') => new ApiError(400, code, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, 'not_found', msg);

export const now = () => new Date().toISOString();

// ---- hashing (scrypt, no native deps) ----
export function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(secret), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifySecret(secret, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(secret), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ---- identifiers ----
export const txnId = () => 'TXN' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase();
export const utr = () => String(crypto.randomInt(100000, 999999)) + String(crypto.randomInt(100000, 999999));

// ---- money: always integer paise ----
export const MAX_TXN_PAISE = 100000_00; // ₹1,00,000 per transaction
export const DAILY_LIMIT_PAISE = 200000_00; // ₹2,00,000 per day

export function parseAmount(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw badRequest('Amount must be a positive whole number of paise', 'invalid_amount');
  if (n > MAX_TXN_PAISE) throw badRequest('Amount exceeds the ₹1,00,000 per-transaction limit', 'limit_exceeded');
  return n;
}

export function formatINR(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw badRequest(`${field} must be ${min}-${max} characters`, 'invalid_' + field.toLowerCase().replace(/\s+/g, '_'));
  }
  return value.trim();
}

export function optionalNote(note) {
  if (note == null || note === '') return null;
  if (typeof note !== 'string') throw badRequest('Note must be text');
  const t = note.trim();
  if (t.length > 80) throw badRequest('Note must be 80 characters or fewer');
  return t || null;
}

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];
export const randomColor = () => COLORS[crypto.randomInt(COLORS.length)];

export function maskPhone(phone) {
  return phone.slice(0, 2) + '******' + phone.slice(-2);
}

export function maskAccount(num) {
  return 'XXXX' + String(num).slice(-4);
}
