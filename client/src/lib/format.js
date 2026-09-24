export function inr(paise, { sign = false, decimals } = {}) {
  const abs = Math.abs(paise) / 100;
  const hasFraction = Math.round(Math.abs(paise)) % 100 !== 0;
  const d = decimals ?? (hasFraction ? 2 : 0);
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const prefix = sign ? (paise < 0 ? '− ' : '+ ') : paise < 0 ? '−' : '';
  return `${prefix}₹${s}`;
}

/** "1,250.5" -> 125050 paise. Returns null for invalid input. */
export function toPaise(text) {
  const t = String(text ?? '').replace(/,/g, '').trim();
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(t)) return null;
  const [r, p = ''] = t.split('.');
  const value = Number(r) * 100 + Number((p + '00').slice(0, 2));
  return value > 0 ? value : null;
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const dateTime = (iso) => new Date(iso).toLocaleString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export const shortTime = (iso) => new Date(iso).toLocaleString('en-IN', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

export const monthLabel = (iso) => new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export const newIdemKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Parse a UPI QR payload (upi://pay?pa=...) or a bare UPI ID / phone number. */
export function parseUpi(text) {
  const t = String(text || '').trim();
  if (/^upi:\/\/pay\?/i.test(t)) {
    const params = new URLSearchParams(t.slice(t.indexOf('?') + 1));
    const pa = params.get('pa');
    if (!pa) return null;
    return { pa, pn: params.get('pn'), am: params.get('am'), tn: params.get('tn') };
  }
  if (/^[\w.-]{2,}@[\w]{2,}$/.test(t) || /^[6-9]\d{9}$/.test(t)) return { pa: t };
  return null;
}

export const upiUri = ({ pa, pn, am, tn }) => {
  const p = new URLSearchParams({ pa, pn, cu: 'INR' });
  if (am) p.set('am', am);
  if (tn) p.set('tn', tn);
  return `upi://pay?${p.toString()}`;
};

export const CATEGORY_LABELS = {
  transfer: 'Transfers', mobile: 'Mobile', electricity: 'Electricity', dth: 'DTH', broadband: 'Broadband',
  water: 'Water', gas: 'Gas', fastag: 'FASTag', creditcard: 'Credit card', wallet: 'Wallet', cashback: 'Cashback',
};
