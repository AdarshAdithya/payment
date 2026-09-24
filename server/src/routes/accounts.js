import express from 'express';
import { ApiError, badRequest, notFound, now, parseAmount, maskAccount, requireString } from '../util.js';
import { verifyPin, topUpWallet, getTxn, getUser } from '../ledger.js';
import { transaction } from '../db.js';

const view = (a) => ({
  id: a.id,
  bankName: a.bank_name,
  accountNumber: maskAccount(a.account_number),
  ifsc: a.ifsc,
  isPrimary: !!a.is_primary,
  createdAt: a.created_at,
});

const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Canara Bank', 'Bank of Baroda', 'Punjab National Bank'];

export function accountsRouter(db) {
  const r = express.Router();
  const own = (req) => {
    const a = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND user_id = ? AND is_active = 1').get(Number(req.params.id), req.userId);
    if (!a) throw notFound('Bank account not found');
    return a;
  };

  r.get('/banks', (_req, res) => res.json({ banks: BANKS }));

  r.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM bank_accounts WHERE user_id = ? AND is_active = 1 ORDER BY is_primary DESC, id').all(req.userId);
    res.json({ accounts: rows.map(view), walletBalance: getUser(db, req.userId).wallet_balance });
  });

  // Linking is simulated: a real app would verify via the bank/NPCI. We seed a demo balance.
  r.post('/', (req, res) => {
    const { bankName, accountNumber, ifsc } = req.body || {};
    const bank = requireString(bankName, 'Bank name', { min: 2, max: 60 });
    if (typeof accountNumber !== 'string' || !/^\d{9,18}$/.test(accountNumber)) throw badRequest('Account number must be 9-18 digits', 'invalid_account');
    if (typeof ifsc !== 'string' || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) throw badRequest('Enter a valid IFSC code (e.g. HDFC0001234)', 'invalid_ifsc');
    const count = db.prepare('SELECT COUNT(*) AS n FROM bank_accounts WHERE user_id = ? AND is_active = 1').get(req.userId).n;
    if (count >= 5) throw badRequest('You can link up to 5 bank accounts');
    const dup = db.prepare('SELECT 1 FROM bank_accounts WHERE user_id = ? AND account_number = ? AND ifsc = ? AND is_active = 1')
      .get(req.userId, accountNumber, ifsc.toUpperCase());
    if (dup) throw new ApiError(409, 'duplicate_account', 'This account is already linked');
    const out = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, ifsc, balance, is_primary, created_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(req.userId, bank, accountNumber, ifsc.toUpperCase(), 10000_00, count === 0 ? 1 : 0, now());
    const a = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(Number(out.lastInsertRowid));
    res.status(201).json({ account: view(a) });
  });

  r.post('/:id/primary', (req, res) => {
    const a = own(req);
    transaction(db, () => {
      db.prepare('UPDATE bank_accounts SET is_primary = 0 WHERE user_id = ?').run(req.userId);
      db.prepare('UPDATE bank_accounts SET is_primary = 1 WHERE id = ?').run(a.id);
    });
    res.json({ ok: true });
  });

  // Unlinking is a soft delete so past transactions keep their account details.
  r.delete('/:id', (req, res) => {
    const a = own(req);
    const count = db.prepare('SELECT COUNT(*) AS n FROM bank_accounts WHERE user_id = ? AND is_active = 1').get(req.userId).n;
    if (count <= 1) throw badRequest('Keep at least one linked bank account');
    transaction(db, () => {
      db.prepare('UPDATE bank_accounts SET is_active = 0, is_primary = 0 WHERE id = ?').run(a.id);
      if (a.is_primary) {
        db.prepare('UPDATE bank_accounts SET is_primary = 1 WHERE id = (SELECT id FROM bank_accounts WHERE user_id = ? AND is_active = 1 ORDER BY id LIMIT 1)').run(req.userId);
      }
    });
    res.json({ ok: true });
  });

  // Checking a bank balance requires the UPI PIN, like real UPI apps.
  r.post('/:id/balance', (req, res) => {
    const a = own(req);
    verifyPin(db, req.userId, req.body?.pin);
    res.json({ balance: db.prepare('SELECT balance FROM bank_accounts WHERE id = ?').get(a.id).balance });
  });

  r.post('/wallet/topup', (req, res) => {
    const { accountId, amount, pin } = req.body || {};
    const { transactionId } = topUpWallet(db, req.userId, { accountId, amount: parseAmount(amount), pin });
    res.status(201).json({ transaction: getTxn(db, transactionId, req.userId), walletBalance: getUser(db, req.userId).wallet_balance });
  });

  return r;
}
