import { useState } from 'react';
import { Link } from 'react-router-dom';
import { del, post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Avatar, ErrorBox, Header, Sheet, Spinner } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Accounts() {
  const { data, error, reload } = useApi('/accounts');
  const banks = useApi('/accounts/banks');
  const secure = useSecureAction();
  const toast = useToast();
  const [balances, setBalances] = useState({});
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ bankName: '', accountNumber: '', ifsc: '' });

  const check = async (a) => {
    const r = await secure({ title: 'Check balance', subtitle: `${a.bankName} ${a.accountNumber}` }, (pin) => post(`/accounts/${a.id}/balance`, { pin }));
    if (r) setBalances((b) => ({ ...b, [a.id]: r.balance }));
  };
  const run = async (fn, msg) => { try { await fn(); toast(msg, 'success'); reload(); } catch (e) { toast(e.message, 'error'); } };
  const link = async (e) => {
    e.preventDefault();
    await run(() => post('/accounts', f), 'Bank account linked');
    setAdding(false); setF({ bankName: '', accountNumber: '', ifsc: '' });
  };

  return (
    <div className="screen">
      <Header title="Bank accounts" right={<button className="icon-btn" onClick={() => setAdding(true)} aria-label="Link account"><Icon name="plus" /></button>} />
      <ErrorBox error={error} onRetry={reload} />
      {!data ? <Spinner /> : (
        <>
          <section className="balance-card balance-card--small">
            <div className="balance-card__row">
              <div><span className="label">PayFlow Wallet</span><div className="balance-card__amount">{inr(data.walletBalance, { decimals: 2 })}</div></div>
              <Link to="/wallet/add" className="chip chip--light"><Icon name="plus" size={16} /> Add money</Link>
            </div>
          </section>
          {data.accounts.map((a) => (
            <section key={a.id} className="card">
              <div className="row row--static">
                <Avatar icon="bank" color="#4f46e5" />
                <div className="row__main"><strong>{a.bankName}</strong><span className="muted">{a.accountNumber} · {a.ifsc}</span></div>
                {a.isPrimary && <span className="badge badge--paid">Primary</span>}
              </div>
              <div className="btn-row btn-row--tight">
                {balances[a.id] != null
                  ? <strong className="pos">{inr(balances[a.id], { decimals: 2 })}</strong>
                  : <button className="btn btn--sm btn--ghost" onClick={() => check(a)}><Icon name="eye" size={16} /> Check balance</button>}
                {!a.isPrimary && <button className="btn btn--sm btn--ghost" onClick={() => run(() => post(`/accounts/${a.id}/primary`), 'Primary account updated')}>Make primary</button>}
                {data.accounts.length > 1 && <button className="btn btn--sm btn--ghost neg" onClick={() => window.confirm(`Unlink ${a.bankName}?`) && run(() => del(`/accounts/${a.id}`), 'Account unlinked')}><Icon name="trash" size={16} /></button>}
              </div>
            </section>
          ))}
          <button className="btn btn--ghost btn--block" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Link a bank account</button>
        </>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Link bank account">
        <form onSubmit={link}>
          <label className="field"><span>Bank</span>
            <select value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} required>
              <option value="">Select your bank</option>
              {banks.data?.banks.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label className="field"><span>Account number</span>
            <input inputMode="numeric" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 18) })} required />
          </label>
          <label className="field"><span>IFSC</span>
            <input value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase().slice(0, 11) })} placeholder="HDFC0001234" required />
          </label>
          <p className="muted small">Demo: linked accounts start with ₹10,000.</p>
          <button className="btn btn--primary btn--block">Link account</button>
        </form>
      </Sheet>
    </div>
  );
}
