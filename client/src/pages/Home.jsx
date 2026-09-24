import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { inr } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Sheet, TxnRow, Spinner, billIcon, Empty } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

const ACTIONS = [
  { to: '/scan', icon: 'scan', label: 'Scan any QR' },
  { to: '/pay', icon: 'users', label: 'Pay contacts' },
  { to: '/pay?upi=1', icon: 'at', label: 'Pay UPI ID' },
  { to: '/pay?mode=request', icon: 'request', label: 'Request money' },
  { to: '/split', icon: 'split', label: 'Split bill' },
  { to: '/qr', icon: 'qr', label: 'My QR' },
  { to: '/wallet/add', icon: 'wallet', label: 'Add money' },
  { to: '/accounts', icon: 'bank', label: 'Bank accounts' },
];

const BILLS = [
  ['mobile', 'Mobile'], ['electricity', 'Electricity'], ['dth', 'DTH'], ['broadband', 'Broadband'],
  ['fastag', 'FASTag'], ['gas', 'LPG Gas'], ['water', 'Water'], ['creditcard', 'Credit card'],
];

export default function Home() {
  const { user, counts } = useAuth();
  const navigate = useNavigate();
  const contacts = useApi('/contacts');
  const txns = useApi('/transactions?limit=5');
  const accounts = useApi('/accounts');
  const secure = useSecureAction();
  const toast = useToast();
  const [balance, setBalance] = useState(null);

  const checkBalance = async () => {
    const acct = accounts.data?.accounts.find((a) => a.isPrimary) || accounts.data?.accounts[0];
    if (!acct) return navigate('/accounts');
    const res = await secure({ title: 'Check balance', subtitle: `${acct.bankName} ${acct.accountNumber}` },
      (pin) => post(`/accounts/${acct.id}/balance`, { pin }));
    if (res) setBalance({ ...acct, balance: res.balance });
  };

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(user.upiId); toast('UPI ID copied', 'success'); } catch { toast(user.upiId); }
  };

  return (
    <div className="screen home">
      <div className="home__top">
        <Link to="/profile" aria-label="Profile"><Avatar name={user.name} color={user.avatarColor} size={40} /></Link>
        <Link to="/pay" className="search-pill"><Icon name="search" size={18} /> Pay by name, phone or UPI ID</Link>
        <Link to="/notifications" className="icon-btn" aria-label="Notifications">
          <Icon name="bell" />
          {counts.unread > 0 && <span className="dot-badge">{counts.unread > 9 ? '9+' : counts.unread}</span>}
        </Link>
      </div>

      <section className="balance-card">
        <div className="balance-card__row">
          <div>
            <span className="label">PayFlow Wallet</span>
            <div className="balance-card__amount">{inr(user.walletBalance, { decimals: 2 })}</div>
          </div>
          <Link to="/wallet/add" className="chip chip--light"><Icon name="plus" size={16} /> Add money</Link>
        </div>
        <div className="balance-card__row balance-card__row--foot">
          <button className="upi-chip" onClick={copyUpi}><span>UPI ID:</span> {user.upiId} <Icon name="copy" size={14} /></button>
          <button className="link link--light" onClick={checkBalance}>Check bank balance <Icon name="chevron" size={14} /></button>
        </div>
      </section>

      {counts.pendingRequests > 0 && (
        <Link to="/requests" className="banner banner--warn">
          <Icon name="request" />
          <span><strong>{counts.pendingRequests} payment request{counts.pendingRequests > 1 ? 's' : ''}</strong> waiting for you</span>
          <Icon name="chevron" size={18} />
        </Link>
      )}

      <section className="card">
        <div className="actions">
          {ACTIONS.map((a) => (
            <Link key={a.label} to={a.to} className="action">
              <span className="action__icon"><Icon name={a.icon} /></span>
              <span>{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>People</h2><Link to="/pay" className="link">See all</Link></div>
        {contacts.loading && !contacts.data ? <Spinner /> : contacts.data?.contacts.length ? (
          <div className="people">
            {contacts.data.contacts.slice(0, 7).map((c) => (
              <Link key={c.id} to={`/people/${c.id}`} className="person">
                <Avatar name={c.name} color={c.avatarColor} size={52} />
                <span>{c.name.split(' ')[0]}</span>
              </Link>
            ))}
            <Link to="/pay" className="person">
              <span className="avatar avatar--outline" style={{ width: 52, height: 52 }}><Icon name="plus" /></span>
              <span>New</span>
            </Link>
          </div>
        ) : <p className="muted">Pay someone to see them here.</p>}
      </section>

      <section className="card">
        <div className="card__head"><h2>Recharge & pay bills</h2><Link to="/bills" className="link">See all</Link></div>
        <div className="actions">
          {BILLS.map(([cat, label]) => (
            <Link key={cat} to={`/bills?category=${cat}`} className="action action--bill">
              <span className="action__icon"><Icon name={billIcon(cat)} /></span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {counts.unscratched > 0 && (
        <Link to="/rewards" className="banner banner--reward">
          <span className="banner__gift"><Icon name="gift" size={26} /></span>
          <span><strong>You have {counts.unscratched} scratch card{counts.unscratched > 1 ? 's' : ''}!</strong><br />Scratch to win cashback</span>
          <Icon name="chevron" size={18} />
        </Link>
      )}

      <section className="card">
        <div className="card__head"><h2>Recent activity</h2><Link to="/history" className="link">View all</Link></div>
        {txns.loading && !txns.data ? <Spinner /> : txns.data?.transactions.length ? (
          <div className="list">{txns.data.transactions.map((t) => <TxnRow key={t.id} txn={t} />)}</div>
        ) : <Empty icon="clock" title="No transactions yet">Your payments will show up here.</Empty>}
      </section>

      <p className="footnote"><Icon name="shield" size={14} /> Payments secured with UPI PIN · Demo app, no real money moves</p>

      <Sheet open={!!balance} onClose={() => setBalance(null)} title="Account balance">
        {balance && (
          <div className="balance-reveal">
            <Avatar icon="bank" color="#4f46e5" size={52} />
            <p>{balance.bankName} · {balance.accountNumber}</p>
            <h2>{inr(balance.balance, { decimals: 2 })}</h2>
            <span className="muted">Available balance</span>
            <button className="btn btn--primary btn--block" onClick={() => setBalance(null)}>Done</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
