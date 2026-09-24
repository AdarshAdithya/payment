import express from 'express';
import { parseAmount, optionalNote, maskPhone, notFound } from '../util.js';
import { sendMoney, getTxn, listTxns, publicUser, getUser, resolvePayee } from '../ledger.js';

export function paymentsRouter(db) {
  const r = express.Router();

  // Search PayFlow users by name, phone or UPI ID.
  r.get('/users/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 50);
    if (q.length < 2) return res.json({ users: [] });
    const rows = db.prepare(`SELECT * FROM users WHERE id != ? AND (lower(name) LIKE ? OR phone LIKE ? OR lower(upi_id) LIKE ?)
                             ORDER BY name LIMIT 10`).all(req.userId, `%${q}%`, `${q}%`, `${q}%`);
    res.json({ users: rows.map((u) => ({ ...publicUser(u), phone: maskPhone(u.phone) })) });
  });

  // Verify a payee before paying, like "verify UPI ID" in real apps.
  r.get('/users/resolve', (req, res) => {
    const u = resolvePayee(db, String(req.query.handle || ''));
    res.json({ user: { ...publicUser(u), phone: maskPhone(u.phone), isSelf: u.id === req.userId } });
  });

  r.get('/users/:id', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
    if (!u) throw notFound('User not found');
    res.json({ user: { ...publicUser(u), phone: maskPhone(u.phone) } });
  });

  // People you've transacted with, most recent first.
  r.get('/contacts', (req, res) => {
    const rows = db.prepare(`
      SELECT u.*, MAX(x.at) AS last_at FROM (
        SELECT payee_id AS other, created_at AS at FROM transactions WHERE kind = 'p2p' AND payer_id = :me
        UNION ALL SELECT payer_id, created_at FROM transactions WHERE kind = 'p2p' AND payee_id = :me
        UNION ALL SELECT payer_id, created_at FROM money_requests WHERE requester_id = :me
        UNION ALL SELECT requester_id, created_at FROM money_requests WHERE payer_id = :me
      ) x JOIN users u ON u.id = x.other
      WHERE u.id != :me
      GROUP BY u.id ORDER BY last_at DESC LIMIT 20`).all({ me: req.userId });
    res.json({ contacts: rows.map((u) => ({ ...publicUser(u), lastActivity: u.last_at })) });
  });

  // Chat-style timeline of payments and requests with one person.
  r.get('/contacts/:id/activity', (req, res) => {
    const other = getUser(db, Number(req.params.id));
    const txns = listTxns(db, req.userId, { withUser: other.id, limit: 100 }).map((t) => ({ type: 'txn', at: t.createdAt, txn: t }));
    const reqs = db.prepare(`SELECT * FROM money_requests WHERE (requester_id = :me AND payer_id = :o) OR (requester_id = :o AND payer_id = :me)
                             ORDER BY created_at DESC LIMIT 100`).all({ me: req.userId, o: other.id })
      .filter((m) => m.status !== 'paid') // paid requests appear as their transaction
      .map((m) => ({
        type: 'request', at: m.created_at,
        request: { id: m.id, amount: m.amount, note: m.note, status: m.status, outgoing: m.requester_id === req.userId, createdAt: m.created_at },
      }));
    const items = [...txns, ...reqs].sort((a, b) => a.at.localeCompare(b.at));
    res.json({ user: { ...publicUser(other), phone: maskPhone(other.phone) }, items });
  });

  r.post('/payments', (req, res) => {
    const { to, amount, note, source, pin, idempotencyKey } = req.body || {};
    const out = sendMoney(db, req.userId, {
      to, amount: parseAmount(amount), note: optionalNote(note), source, pin, idempotencyKey,
    });
    res.status(out.replayed ? 200 : 201).json({ transaction: getTxn(db, out.transactionId, req.userId), rewardId: out.rewardId });
  });

  r.get('/transactions', (req, res) => {
    const { filter, q, limit, before } = req.query;
    res.json({ transactions: listTxns(db, req.userId, { filter, q, limit, before }) });
  });

  r.get('/transactions/:id', (req, res) => {
    res.json({ transaction: getTxn(db, req.params.id, req.userId) });
  });

  // Monthly money-in / money-out summary with a category breakdown.
  r.get('/insights', (req, res) => {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - (months - 1));
    const rows = db.prepare(`SELECT kind, payer_id, payee_id, amount, category, created_at FROM transactions
                             WHERE (payer_id = :me OR payee_id = :me) AND created_at >= :start AND kind != 'topup'`)
      .all({ me: req.userId, start: start.toISOString() });
    const byMonth = new Map();
    for (let i = 0; i < months; i++) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      byMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, { spent: 0, received: 0 });
    }
    const categories = {};
    const thisMonth = [...byMonth.keys()].at(-1);
    for (const t of rows) {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      const out = t.payer_id === req.userId;
      if (out) bucket.spent += t.amount; else bucket.received += t.amount;
      if (out && key === thisMonth) categories[t.category] = (categories[t.category] || 0) + t.amount;
    }
    res.json({
      months: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
      categories: Object.entries(categories).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    });
  });

  return r;
}
