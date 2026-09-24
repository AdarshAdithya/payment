import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { ApiError } from './util.js';
import { authRouter, meRouter, requireAuth } from './auth.js';
import { accountsRouter } from './routes/accounts.js';
import { paymentsRouter } from './routes/payments.js';
import { requestsRouter } from './routes/requests.js';
import { billsRouter } from './routes/bills.js';
import { miscRouter } from './routes/misc.js';

export function createApp({ db, jwtSecret, staticDir = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter(db, jwtSecret));
  api.use(requireAuth(jwtSecret));
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use('/me', meRouter(db));
  api.use('/accounts', accountsRouter(db));
  api.use(paymentsRouter(db));
  api.use(requestsRouter(db));
  api.use(billsRouter(db));
  api.use(miscRouter(db));
  api.use((_req, _res, next) => next(new ApiError(404, 'not_found', 'Unknown API route')));
  app.use('/api', api);

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
  });

  return app;
}
