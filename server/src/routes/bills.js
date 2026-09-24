import express from 'express';
import crypto from 'node:crypto';
import { badRequest, notFound, parseAmount } from '../util.js';
import { payBill, getTxn } from '../ledger.js';

export const CATEGORIES = [
  { id: 'mobile', label: 'Mobile Recharge' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'dth', label: 'DTH' },
  { id: 'broadband', label: 'Broadband' },
  { id: 'water', label: 'Water' },
  { id: 'gas', label: 'LPG Gas' },
  { id: 'fastag', label: 'FASTag' },
  { id: 'creditcard', label: 'Credit Card' },
];

const PLANS = [
  { id: 'p1', price: 199_00, validity: '28 days', data: '1.5 GB/day', perks: 'Unlimited calls, 100 SMS/day' },
  { id: 'p2', price: 299_00, validity: '28 days', data: '2 GB/day', perks: 'Unlimited calls, 100 SMS/day, OTT app' },
  { id: 'p3', price: 479_00, validity: '56 days', data: '1.5 GB/day', perks: 'Unlimited calls, 100 SMS/day' },
  { id: 'p4', price: 719_00, validity: '84 days', data: '2 GB/day', perks: 'Unlimited calls, 100 SMS/day' },
  { id: 'p5', price: 2999_00, validity: '365 days', data: '2.5 GB/day', perks: 'Unlimited calls, 100 SMS/day, OTT bundle' },
  { id: 'p6', price: 19_00, validity: '1 day', data: '1 GB', perks: 'Data add-on' },
];

const view = (b) => ({ id: b.id, category: b.category, name: b.name, inputLabel: b.input_label, inputPattern: b.input_pattern });

// Bills are simulated: amount is derived deterministically from biller + consumer number + month.
function simulatedBill(biller, consumerNumber) {
  const d = new Date();
  const seed = crypto.createHash('sha256').update(`${biller.id}|${consumerNumber}|${d.getFullYear()}-${d.getMonth()}`).digest();
  const amount = (300 + (seed.readUInt32BE(0) % 4200)) * 100;
  const due = new Date(d.getFullYear(), d.getMonth(), 20);
  if (due < d) due.setMonth(due.getMonth() + 1);
  const names = ['A. Kumar', 'S. Sharma', 'R. Iyer', 'P. Reddy', 'M. Das', 'K. Nair'];
  return { amount, dueDate: due.toISOString().slice(0, 10), customerName: names[seed[4] % names.length], billNumber: 'BL' + seed.readUInt32BE(8) };
}

export function billsRouter(db) {
  const r = express.Router();
  const getBiller = (id) => {
    const b = db.prepare('SELECT * FROM billers WHERE id = ?').get(Number(id));
    if (!b) throw notFound('Biller not found');
    return b;
  };
  const checkConsumer = (b, value) => {
    const v = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!new RegExp(b.input_pattern).test(v)) throw badRequest(`Enter a valid ${b.input_label.toLowerCase()}`, 'invalid_consumer');
    return v;
  };

  r.get('/billers', (req, res) => {
    const rows = req.query.category
      ? db.prepare('SELECT * FROM billers WHERE category = ? ORDER BY name').all(String(req.query.category))
      : db.prepare('SELECT * FROM billers ORDER BY category, name').all();
    res.json({ categories: CATEGORIES, billers: rows.map(view) });
  });

  r.get('/billers/:id/plans', (req, res) => {
    const b = getBiller(req.params.id);
    if (b.category !== 'mobile') throw badRequest('Plans are only available for mobile recharges');
    res.json({ plans: PLANS });
  });

  r.post('/bills/fetch', (req, res) => {
    const b = getBiller(req.body?.billerId);
    if (b.category === 'mobile') throw badRequest('Choose a recharge plan instead');
    const consumerNumber = checkConsumer(b, req.body?.consumerNumber);
    res.json({ biller: view(b), consumerNumber, bill: simulatedBill(b, consumerNumber) });
  });

  r.post('/bills/pay', (req, res) => {
    const { billerId, consumerNumber, amount, planId, source, pin, idempotencyKey } = req.body || {};
    const b = getBiller(billerId);
    const num = checkConsumer(b, consumerNumber);
    let amt;
    let planName;
    if (b.category === 'mobile') {
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) throw badRequest('Choose a recharge plan', 'invalid_plan');
      amt = plan.price;
      planName = `${b.name} ₹${plan.price / 100} · ${plan.validity}`;
    } else if (['fastag', 'creditcard'].includes(b.category)) {
      amt = parseAmount(amount); // user-entered amount
    } else {
      amt = simulatedBill(b, num).amount; // never trust a client-supplied bill amount
    }
    const out = payBill(db, req.userId, { biller: b, consumerNumber: num, amount: amt, source, pin, idempotencyKey, planName });
    res.status(out.replayed ? 200 : 201).json({ transaction: getTxn(db, out.transactionId, req.userId), rewardId: out.rewardId });
  });

  return r;
}
