import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { inr, initials, shortTime, CATEGORY_LABELS } from '../lib/format.js';

export function Avatar({ name, color = '#6366f1', size = 44, icon }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {icon ? <Icon name={icon} size={size * 0.5} /> : initials(name)}
    </span>
  );
}

export function Header({ title, subtitle, back = true, right, transparent }) {
  const navigate = useNavigate();
  return (
    <header className={`topbar ${transparent ? 'topbar--clear' : ''}`}>
      {back && (
        <button className="icon-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Back">
          <Icon name="back" />
        </button>
      )}
      <div className="topbar__title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar__right">{right}</div>
    </header>
  );
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box">
      <Icon name="alert" size={18} />
      <span>{error.message}</span>
      {onRetry && <button className="link" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        {title && (
          <div className="sheet__head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const BILL_ICONS = { mobile: 'phone', electricity: 'bolt', dth: 'tv', broadband: 'wifi', water: 'droplet', gas: 'flame', fastag: 'car', creditcard: 'card' };
export const billIcon = (cat) => BILL_ICONS[cat] || 'card';

export function CounterpartyAvatar({ txn, size = 44 }) {
  const c = txn.counterparty;
  if (c.type === 'user') return <Avatar name={c.name} color={c.avatarColor} size={size} />;
  if (c.type === 'biller') return <Avatar icon={billIcon(c.category)} color="#0f766e" size={size} />;
  if (c.type === 'rewards') return <Avatar icon="gift" color="#d97706" size={size} />;
  return <Avatar icon="wallet" color="#4f46e5" size={size} />;
}

export function txnTitle(t) {
  if (t.kind === 'topup') return 'Added to wallet';
  if (t.kind === 'cashback') return 'Cashback received';
  if (t.kind === 'bill') return t.counterparty.name;
  return t.direction === 'debit' ? `Paid to ${t.counterparty.name}` : `Received from ${t.counterparty.name}`;
}

export function TxnRow({ txn }) {
  const credit = txn.direction === 'credit';
  const sub = txn.note || (txn.kind === 'bill' ? CATEGORY_LABELS[txn.category] : txn.counterparty.upiId) || '';
  return (
    <Link to={`/txn/${txn.id}`} className="row">
      <CounterpartyAvatar txn={txn} />
      <div className="row__main">
        <strong>{txnTitle(txn)}</strong>
        <span className="muted">{sub ? `${sub} · ` : ''}{shortTime(txn.createdAt)}</span>
      </div>
      <div className={`row__amount ${credit ? 'pos' : ''}`}>
        {credit ? '+' : txn.direction === 'self' ? '' : '−'}{inr(txn.amount)}
      </div>
    </Link>
  );
}

export function SourcePicker({ accounts, walletBalance, value, onChange, amount, hideWallet }) {
  const options = [
    ...accounts.map((a) => ({ id: String(a.id), label: a.bankName, sub: `${a.accountNumber}${a.isPrimary ? ' · Primary' : ''}`, icon: 'bank' })),
    ...(hideWallet ? [] : [{ id: 'wallet', label: 'PayFlow Wallet', sub: `Balance ${inr(walletBalance)}`, icon: 'wallet', short: amount > walletBalance }]),
  ];
  return (
    <div className="sources" role="radiogroup" aria-label="Pay from">
      {options.map((o) => (
        <button
          type="button" key={o.id} role="radio" aria-checked={value === o.id}
          className={`source ${value === o.id ? 'is-active' : ''}`} onClick={() => onChange(o.id)}
        >
          <span className="source__icon"><Icon name={o.icon} size={18} /></span>
          <span className="source__text">
            <strong>{o.label}</strong>
            <span className={o.short ? 'neg' : 'muted'}>{o.short ? 'Insufficient balance' : o.sub}</span>
          </span>
          <span className="radio" />
        </button>
      ))}
    </div>
  );
}

export function AmountInput({ value, onChange, autoFocus, readOnly }) {
  return (
    <label className="amount-input">
      <span className="amount-input__sym">₹</span>
      <input
        inputMode="decimal" placeholder="0" value={value} autoFocus={autoFocus} readOnly={readOnly}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '');
          if (/^\d{0,6}(\.\d{0,2})?$/.test(v)) onChange(v);
        }}
        aria-label="Amount in rupees"
        style={{ width: `${Math.max(1, value.length || 1) + 0.5}ch` }}
      />
    </label>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{status}</span>;
}
