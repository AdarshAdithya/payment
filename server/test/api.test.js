import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDemo, DEMO_PASSWORD, DEMO_PIN } from '../src/seed.js';

let server;
let base;
let db;

before(async () => {
  db = openDb(':memory:');
  seedDemo(db);
  server = createApp({ db, jwtSecret: 'test-secret' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function login(phone) {
  const r = await call('POST', '/auth/login', { body: { phone, password: DEMO_PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

async function primaryBalance(token, pin = DEMO_PIN) {
  const { body } = await call('GET', '/accounts', { token });
  const acct = body.accounts.find((a) => a.isPrimary);
  const bal = await call('POST', `/accounts/${acct.id}/balance`, { token, body: { pin } });
  return { id: acct.id, balance: bal.body.balance, wallet: body.walletBalance };
}

async function register(phone, name = 'Test User') {
  const r = await call('POST', '/auth/register', { body: { name, phone, password: 'password123', pin: '4321' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test('rejects unauthenticated requests', async () => {
  const r = await call('GET', '/me');
  assert.equal(r.status, 401);
});

test('register validates input and blocks duplicate phones', async () => {
  const bad = await call('POST', '/auth/register', { body: { name: 'X', phone: '123', password: 'short', pin: '1' } });
  assert.equal(bad.status, 400);
  const { user } = await register('9000000001', 'Neha Kapoor');
  assert.equal(user.upiId, '9000000001@payflow');
  const dup = await call('POST', '/auth/register', { body: { name: 'Neha', phone: '9000000001', password: 'password123', pin: '1234' } });
  assert.equal(dup.status, 409);
});

test('login rejects a wrong password', async () => {
  const r = await call('POST', '/auth/login', { body: { phone: '9876543210', password: 'nope-nope' } });
  assert.equal(r.status, 401);
});

test('p2p payment moves money atomically between bank accounts', async () => {
  const a = await login('9876543210');
  const b = await login('9876500001');
  const before = await primaryBalance(a);
  const beforeB = await primaryBalance(b);
  const r = await call('POST', '/payments', {
    token: a, body: { to: '9876500001@payflow', amount: 250_00, note: 'Lunch', source: before.id, pin: DEMO_PIN },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.transaction.direction, 'debit');
  assert.equal(r.body.transaction.counterparty.name, 'Priya Sharma');
  assert.ok(r.body.rewardId, '₹100+ payments earn a scratch card');
  assert.equal((await primaryBalance(a)).balance, before.balance - 250_00);
  assert.equal((await primaryBalance(b)).balance, beforeB.balance + 250_00);

  const seen = await call('GET', `/transactions/${r.body.transaction.id}`, { token: b });
  assert.equal(seen.body.transaction.direction, 'credit');
  const other = await login('9876500002');
  assert.equal((await call('GET', `/transactions/${r.body.transaction.id}`, { token: other })).status, 404);
});

test('payment by phone number from wallet, and idempotent retries', async () => {
  const a = await login('9876500003');
  const start = (await primaryBalance(a)).wallet;
  const body = { to: '9876500004', amount: 50_00, source: 'wallet', pin: DEMO_PIN, idempotencyKey: 'retry-key-0001' };
  const first = await call('POST', '/payments', { token: a, body });
  const second = await call('POST', '/payments', { token: a, body });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(first.body.transaction.id, second.body.transaction.id);
  assert.equal((await primaryBalance(a)).wallet, start - 50_00);
});

test('insufficient funds rolls back cleanly', async () => {
  const a = await login('9876500002');
  const { wallet } = await primaryBalance(a);
  const r = await call('POST', '/payments', { token: a, body: { to: '9876543210', amount: wallet + 1, source: 'wallet', pin: DEMO_PIN } });
  assert.equal(r.status, 402);
  assert.equal((await primaryBalance(a)).wallet, wallet);
});

test('rejects self payment, bad amounts and over-limit amounts', async () => {
  const a = await login('9876543210');
  const self = await call('POST', '/payments', { token: a, body: { to: '9876543210@payflow', amount: 100, source: 'wallet', pin: DEMO_PIN } });
  assert.equal(self.status, 400);
  for (const amount of [0, -5, 10.5, '12', 100000_01]) {
    const r = await call('POST', '/payments', { token: a, body: { to: '9876500001', amount, source: 'wallet', pin: DEMO_PIN } });
    assert.equal(r.status, 400, `amount ${amount}`);
  }
});

test('cannot spend from another user\'s bank account', async () => {
  const a = await login('9876543210');
  const b = await login('9876500001');
  const bAcct = (await call('GET', '/accounts', { token: b })).body.accounts[0].id;
  const r = await call('POST', '/payments', { token: a, body: { to: '9876500002', amount: 100, source: bAcct, pin: DEMO_PIN } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'invalid_source');
});

test('wrong PIN is counted and locks after 3 attempts', async () => {
  const { token } = await register('9000000002');
  const pay = (pin) => call('POST', '/payments', { token, body: { to: '9876543210', amount: 100, source: 'wallet', pin } });
  assert.equal((await pay('0000')).body.error.attemptsLeft, 2);
  assert.equal((await pay('0000')).body.error.attemptsLeft, 1);
  assert.equal((await pay('0000')).status, 423);
  assert.equal((await pay('4321')).status, 423, 'locked even with the right PIN');
});

test('money request: pay flow and status transitions', async () => {
  const a = await login('9876543210');
  const k = await login('9876500004');
  const created = await call('POST', '/requests', { token: k, body: { from: '9876543210@payflow', amount: 120_00, note: 'Snacks' } });
  assert.equal(created.status, 201);
  const id = created.body.request.id;
  const { incoming } = (await call('GET', '/requests', { token: a })).body;
  assert.ok(incoming.some((m) => m.id === id && m.status === 'pending'));
  // requester cannot pay their own request
  assert.equal((await call('POST', `/requests/${id}/pay`, { token: k, body: { source: 'wallet', pin: DEMO_PIN } })).status, 404);
  const paid = await call('POST', `/requests/${id}/pay`, { token: a, body: { source: 'wallet', pin: DEMO_PIN } });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  assert.equal(paid.body.request.status, 'paid');
  const again = await call('POST', `/requests/${id}/pay`, { token: a, body: { source: 'wallet', pin: DEMO_PIN } });
  assert.equal(again.status, 409);
  const declineAfter = await call('POST', `/requests/${id}/decline`, { token: a });
  assert.equal(declineAfter.status, 409);
});

test('split bill creates equal requests', async () => {
  const a = await login('9876543210');
  const r = await call('POST', '/splits', {
    token: a, body: { title: 'Goa trip', total: 900_01, participants: ['9876500001', '9876500002@payflow', '9876500001'] },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.split.requests.length, 2, 'duplicates removed');
  assert.ok(r.body.split.requests.every((m) => m.amount === 300_00));
});

test('bills: fetch, pay with server-side amount, and recharge plans', async () => {
  const a = await login('9876500001');
  const { billers } = (await call('GET', '/billers', { token: a })).body;
  const bescom = billers.find((b) => b.name.startsWith('BESCOM'));
  assert.equal((await call('POST', '/bills/fetch', { token: a, body: { billerId: bescom.id, consumerNumber: '12' } })).status, 400);
  const fetched = await call('POST', '/bills/fetch', { token: a, body: { billerId: bescom.id, consumerNumber: '1234567890' } });
  assert.equal(fetched.status, 200);
  const { id: acct } = await primaryBalance(a);
  const paid = await call('POST', '/bills/pay', {
    token: a, body: { billerId: bescom.id, consumerNumber: '1234567890', amount: 1, source: acct, pin: DEMO_PIN },
  });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.transaction.amount, fetched.body.bill.amount, 'client amount is ignored');

  const jio = billers.find((b) => b.name === 'Jio Prepaid');
  const { plans } = (await call('GET', `/billers/${jio.id}/plans`, { token: a })).body;
  const rc = await call('POST', '/bills/pay', {
    token: a, body: { billerId: jio.id, consumerNumber: '9876500001', planId: plans[0].id, source: 'wallet', pin: DEMO_PIN },
  });
  assert.equal(rc.status, 201, JSON.stringify(rc.body));
  assert.equal(rc.body.transaction.amount, plans[0].price);
  const bills = (await call('GET', '/transactions?filter=bills', { token: a })).body.transactions;
  assert.equal(bills.length, 2);
});

test('wallet top-up and scratch card credit the wallet exactly once', async () => {
  const a = await login('9876500002');
  const { id: acct, wallet } = await primaryBalance(a);
  const top = await call('POST', '/accounts/wallet/topup', { token: a, body: { accountId: acct, amount: 1000_00, pin: DEMO_PIN } });
  assert.equal(top.status, 201);
  assert.equal(top.body.walletBalance, wallet + 1000_00);

  const { rewards } = (await call('GET', '/rewards', { token: a })).body;
  const card = rewards.find((r) => !r.scratched);
  assert.ok(card);
  assert.equal(card.amount, null, 'value hidden before scratching');
  const s1 = await call('POST', `/rewards/${card.id}/scratch`, { token: a });
  const s2 = await call('POST', `/rewards/${card.id}/scratch`, { token: a });
  assert.equal(s1.body.walletBalance, wallet + 1000_00 + s1.body.reward.amount);
  assert.equal(s2.body.walletBalance, s1.body.walletBalance);
});

test('contacts, activity, search and insights', async () => {
  const a = await login('9876543210');
  const { contacts } = (await call('GET', '/contacts', { token: a })).body;
  assert.ok(contacts.length >= 3);
  const act = await call('GET', `/contacts/${contacts[0].id}/activity`, { token: a });
  assert.equal(act.status, 200);
  assert.ok(act.body.items.length > 0);
  const search = await call('GET', '/users/search?q=priya', { token: a });
  assert.equal(search.body.users[0].name, 'Priya Sharma');
  assert.match(search.body.users[0].phone, /\*+/);
  const ins = await call('GET', '/insights', { token: a });
  assert.equal(ins.body.months.length, 6);
  assert.ok(ins.body.months.at(-1).spent > 0);
});

test('ledger invariant: total money in the system is conserved', () => {
  const bank = db.prepare('SELECT SUM(balance) AS s FROM bank_accounts').get().s;
  const wallet = db.prepare('SELECT SUM(wallet_balance) AS s FROM users').get().s;
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const billsPaid = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE kind = 'bill'").get().s;
  const cashback = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE kind = 'cashback'").get().s;
  const opening = users * (25000_00 + 500_00);
  assert.equal(bank + wallet, opening - billsPaid + cashback);
});
