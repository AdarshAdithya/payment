import express from 'express';
import { scratchReward, getUser } from '../ledger.js';

export function miscRouter(db) {
  const r = express.Router();

  r.get('/rewards', (req, res) => {
    const rows = db.prepare(`SELECT r.*, t.amount AS txn_amount, t.kind AS txn_kind, pe.name AS payee_name, b.name AS biller_name
                             FROM rewards r LEFT JOIN transactions t ON t.id = r.transaction_id
                             LEFT JOIN users pe ON pe.id = t.payee_id LEFT JOIN billers b ON b.id = t.biller_id
                             WHERE r.user_id = ? ORDER BY r.scratched ASC, r.created_at DESC LIMIT 100`).all(req.userId);
    const total = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM rewards WHERE user_id = ? AND scratched = 1').get(req.userId).s;
    res.json({
      totalEarned: total,
      rewards: rows.map((r) => ({
        id: r.id,
        scratched: !!r.scratched,
        amount: r.scratched ? r.amount : null, // don't leak unscratched values
        for: r.txn_kind === 'bill' ? r.biller_name : r.payee_name,
        transactionId: r.transaction_id,
        createdAt: r.created_at,
      })),
    });
  });

  r.post('/rewards/:id/scratch', (req, res) => {
    const r2 = scratchReward(db, req.userId, Number(req.params.id));
    res.json({ reward: { id: r2.id, amount: r2.amount, scratched: true }, walletBalance: getUser(db, req.userId).wallet_balance });
  });

  r.get('/notifications', (req, res) => {
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(req.userId);
    res.json({
      notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.is_read, createdAt: n.created_at })),
    });
  });

  r.post('/notifications/read', (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.userId);
    res.json({ ok: true });
  });

  return r;
}
