import express from 'express';
import { ApiError, badRequest, notFound, now, parseAmount, optionalNote, requireString, formatINR } from '../util.js';
import { resolvePayee, publicUser, sendMoney, getTxn, notify, getUser } from '../ledger.js';
import { transaction } from '../db.js';

const REQ_SELECT = `
  SELECT m.*, rq.name AS rq_name, rq.upi_id AS rq_upi, rq.avatar_color AS rq_color,
         py.name AS py_name, py.upi_id AS py_upi, py.avatar_color AS py_color, s.title AS split_title
  FROM money_requests m
  JOIN users rq ON rq.id = m.requester_id
  JOIN users py ON py.id = m.payer_id
  LEFT JOIN splits s ON s.id = m.split_id`;

const view = (m) => ({
  id: m.id,
  amount: m.amount,
  note: m.note,
  status: m.status,
  split: m.split_id ? { id: m.split_id, title: m.split_title } : null,
  requester: { id: m.requester_id, name: m.rq_name, upiId: m.rq_upi, avatarColor: m.rq_color },
  payer: { id: m.payer_id, name: m.py_name, upiId: m.py_upi, avatarColor: m.py_color },
  transactionId: m.transaction_id,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

function createRequest(db, requester, payer, amount, note, splitId = null) {
  const t = now();
  const out = db.prepare(`INSERT INTO money_requests (requester_id, payer_id, amount, note, split_id, created_at, updated_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(requester.id, payer.id, amount, note, splitId, t, t);
  notify(db, payer.id, 'request', `${requester.name} requested ${formatINR(amount)}`, note || 'Tap to pay or decline', '/requests');
  return Number(out.lastInsertRowid);
}

export function requestsRouter(db) {
  const r = express.Router();
  const getReq = (id) => {
    const m = db.prepare(`${REQ_SELECT} WHERE m.id = ?`).get(Number(id));
    if (!m) throw notFound('Request not found');
    return m;
  };

  r.get('/requests', (req, res) => {
    const incoming = db.prepare(`${REQ_SELECT} WHERE m.payer_id = ? ORDER BY m.status = 'pending' DESC, m.created_at DESC LIMIT 100`).all(req.userId);
    const outgoing = db.prepare(`${REQ_SELECT} WHERE m.requester_id = ? ORDER BY m.status = 'pending' DESC, m.created_at DESC LIMIT 100`).all(req.userId);
    res.json({ incoming: incoming.map(view), outgoing: outgoing.map(view) });
  });

  r.post('/requests', (req, res) => {
    const { from, amount, note } = req.body || {};
    const payer = resolvePayee(db, from);
    if (payer.id === req.userId) throw badRequest('You cannot request money from yourself', 'self_request');
    const amt = parseAmount(amount);
    const me = getUser(db, req.userId);
    const id = transaction(db, () => createRequest(db, me, payer, amt, optionalNote(note)));
    res.status(201).json({ request: view(getReq(id)) });
  });

  r.post('/requests/:id/pay', (req, res) => {
    const m = getReq(req.params.id);
    if (m.payer_id !== req.userId) throw notFound('Request not found');
    if (m.status !== 'pending') throw new ApiError(409, 'request_closed', `This request is already ${m.status}`);
    const { source, pin, idempotencyKey } = req.body || {};
    const out = sendMoney(db, req.userId, {
      to: m.requester_id, amount: m.amount, note: m.note || (m.split_title ? `Split: ${m.split_title}` : null),
      source, pin, idempotencyKey, requestId: m.id,
    });
    res.status(201).json({ transaction: getTxn(db, out.transactionId, req.userId), rewardId: out.rewardId, request: view(getReq(m.id)) });
  });

  r.post('/requests/:id/decline', (req, res) => {
    const m = getReq(req.params.id);
    if (m.payer_id !== req.userId) throw notFound('Request not found');
    if (m.status !== 'pending') throw new ApiError(409, 'request_closed', `This request is already ${m.status}`);
    transaction(db, () => {
      db.prepare("UPDATE money_requests SET status = 'declined', updated_at = ? WHERE id = ?").run(now(), m.id);
      notify(db, m.requester_id, 'request', 'Request declined', `${m.py_name} declined your request for ${formatINR(m.amount)}`, '/requests');
    });
    res.json({ request: view(getReq(m.id)) });
  });

  r.post('/requests/:id/cancel', (req, res) => {
    const m = getReq(req.params.id);
    if (m.requester_id !== req.userId) throw notFound('Request not found');
    if (m.status !== 'pending') throw new ApiError(409, 'request_closed', `This request is already ${m.status}`);
    db.prepare("UPDATE money_requests SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), m.id);
    res.json({ request: view(getReq(m.id)) });
  });

  // Split a bill equally; creates one money request per participant.
  r.post('/splits', (req, res) => {
    const { title, total, participants, includeSelf = true } = req.body || {};
    const cleanTitle = requireString(title, 'Title', { min: 2, max: 60 });
    const amt = parseAmount(total);
    if (!Array.isArray(participants) || participants.length < 1 || participants.length > 20) {
      throw badRequest('Add 1-20 people to split with', 'invalid_participants');
    }
    const me = getUser(db, req.userId);
    const people = [];
    const seen = new Set([me.id]);
    for (const handle of participants) {
      const u = resolvePayee(db, handle);
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      people.push(u);
    }
    if (!people.length) throw badRequest('Add at least one other person', 'invalid_participants');
    const n = people.length + (includeSelf ? 1 : 0);
    const share = Math.floor(amt / n);
    if (share < 1) throw badRequest('Amount is too small to split');
    // Any leftover paise stay with the creator's share.
    const splitId = transaction(db, () => {
      const out = db.prepare('INSERT INTO splits (creator_id, title, total, created_at) VALUES (?, ?, ?, ?)').run(me.id, cleanTitle, amt, now());
      const id = Number(out.lastInsertRowid);
      for (const p of people) createRequest(db, me, p, share, `Split: ${cleanTitle}`, id);
      return id;
    });
    res.status(201).json({ split: splitView(db, splitId) });
  });

  r.get('/splits', (req, res) => {
    const ids = db.prepare(`SELECT DISTINCT s.id FROM splits s LEFT JOIN money_requests m ON m.split_id = s.id
                            WHERE s.creator_id = ? OR m.payer_id = ? ORDER BY s.created_at DESC LIMIT 50`).all(req.userId, req.userId);
    res.json({ splits: ids.map(({ id }) => splitView(db, id)) });
  });

  return r;
}

function splitView(db, id) {
  const s = db.prepare('SELECT s.*, u.name, u.upi_id, u.avatar_color FROM splits s JOIN users u ON u.id = s.creator_id WHERE s.id = ?').get(id);
  const reqs = db.prepare(`${REQ_SELECT} WHERE m.split_id = ? ORDER BY m.id`).all(id).map(view);
  const collected = reqs.filter((m) => m.status === 'paid').reduce((a, m) => a + m.amount, 0);
  return {
    id: s.id,
    title: s.title,
    total: s.total,
    creator: publicUser({ id: s.creator_id, name: s.name, upi_id: s.upi_id, avatar_color: s.avatar_color }),
    requests: reqs,
    collected,
    pending: reqs.filter((m) => m.status === 'pending').reduce((a, m) => a + m.amount, 0),
    createdAt: s.created_at,
  };
}
