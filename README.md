# PayFlow — UPI-style payments app

A full-stack payments app modelled on Google Pay / PhonePe: send and request money, scan QR codes, split bills, pay bills and recharges, and win scratch-card cashback.

> Demo only: bank accounts and billers are simulated and no real money moves.

## Features
- **Auth**: register or log in with mobile number and password. Each user gets a UPI ID (`<phone>@payflow`), a linked demo bank account and a wallet.
- **Send money**: pay by name, phone, UPI ID or QR code, from a bank account or the wallet. Every payment needs the UPI PIN, which locks for 15 minutes after 3 wrong tries.
- **Scan & pay**: a camera QR scanner (jsQR), plus image upload and manual entry. Reads standard `upi://pay?pa=…&am=…` codes.
- **My QR**: a UPI QR code, optionally with a fixed amount; share or copy your UPI ID.
- **Requests**: request money, then pay, decline or cancel it.
- **Split bills**: split equally among contacts, which sends requests and tracks who has paid.
- **Bills & recharges**: mobile plans, electricity, DTH, broadband, water, gas, FASTag and credit cards. The server computes the bill amount and never trusts the one the client sends.
- **Rewards**: payments of ₹100 or more earn a scratch card (a canvas you scratch off). Cashback goes to the wallet.
- **History**: filters, search (name, note or UTR), paging, and 6-month spend/receive insights with a category breakdown.
- **Chat view** per contact, **notifications**, **bank accounts** (link, set as primary, unlink, check balance with PIN), **add money to wallet**, **profile/PIN/password** changes.

## Money-safety design
- All amounts are integer paise.
- Every debit and credit runs inside one SQLite transaction. A conditional `UPDATE … WHERE balance >= ?` stops balances going negative.
- Idempotency keys make retried payments safe.
- Limits: ₹1,00,000 per transaction and ₹2,00,000 per day.
- Passwords and PINs are hashed with scrypt. Auth uses JWT (HS256), and failed logins are rate-limited.

## Stack
- **Server**: Node ≥ 22.5, Express, built-in `node:sqlite` (no native deps), jsonwebtoken
- **Client**: React 18, React Router, Vite, qrcode, jsqr, plain CSS (mobile-first, dark mode)

## Run it
```bash
cd payment-app
npm run install:all
npm run build                    # build the client
JWT_SECRET=change-me npm start   # serves API + app on http://localhost:4000
```
For development, run `npm run dev:server` and `npm run dev:client` (http://localhost:5173, which proxies `/api`).

**Demo login:** `9876543210` / `demo1234`, UPI PIN `1234`. Other demo users are `9876500001` to `9876500004` with the same password and PIN. Run `npm run seed --prefix server` to reset the demo data.

## Tests
`npm test` runs 15 API tests. They cover payments, rollback, idempotency, PIN lockout, requests, splits, bills, rewards, and a ledger invariant that total money is conserved.

## Deploy
**Render (one click):** [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AdarshAdithya/payment)

The included `render.yaml` builds the `Dockerfile` and generates a `JWT_SECRET` for you. On the free plan the SQLite file is temporary, so the demo data re-seeds whenever the service restarts. To keep data, attach a disk mounted at `/data`.

**Any Docker host** (Railway, Fly.io, a VPS):
```bash
docker build -t payflow .
docker run -p 4000:4000 -e JWT_SECRET=change-me -v payflow-data:/data payflow
```
