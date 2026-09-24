import { useEffect, useState } from 'react';
import { get } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { inr, monthLabel, CATEGORY_LABELS } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Empty, ErrorBox, Spinner, TxnRow } from '../components/ui.jsx';

const FILTERS = [['all', 'All'], ['sent', 'Sent'], ['received', 'Received'], ['bills', 'Bills'], ['wallet', 'Wallet']];
const PAGE = 30;

function Insights() {
  const { data } = useApi('/insights');
  if (!data) return null;
  const max = Math.max(1, ...data.months.map((m) => Math.max(m.spent, m.received)));
  const cur = data.months.at(-1);
  const catTotal = data.categories.reduce((a, c) => a + c.amount, 0);
  return (
    <section className="card insights">
      <div className="insights__summary">
        <div><span className="muted">Spent this month</span><strong className="neg">{inr(cur.spent)}</strong></div>
        <div><span className="muted">Received</span><strong className="pos">{inr(cur.received)}</strong></div>
      </div>
      <div className="bars" role="img" aria-label="Money in and out over the last 6 months">
        {data.months.map((m) => (
          <div key={m.month} className="bars__col" title={`${m.month}: spent ${inr(m.spent)}, received ${inr(m.received)}`}>
            <div className="bars__pair">
              <span className="bar bar--out" style={{ height: `${(m.spent / max) * 100}%` }} />
              <span className="bar bar--in" style={{ height: `${(m.received / max) * 100}%` }} />
            </div>
            <small>{new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</small>
          </div>
        ))}
      </div>
      <div className="legend"><span><i className="bar--out" />Spent</span><span><i className="bar--in" />Received</span></div>
      {data.categories.length > 0 && (
        <div className="cats">
          {data.categories.map((c) => (
            <div key={c.category} className="cat">
              <span>{CATEGORY_LABELS[c.category] || c.category}</span>
              <div className="cat__bar"><span style={{ width: `${(c.amount / catTotal) * 100}%` }} /></div>
              <strong>{inr(c.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function History() {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = (before) => `/transactions?filter=${filter}&limit=${PAGE}&q=${encodeURIComponent(dq)}${before ? `&before=${encodeURIComponent(before)}` : ''}`;

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(null);
    get(query()).then((d) => {
      if (!live) return;
      setItems(d.transactions);
      setMore(d.transactions.length === PAGE);
    }).catch((e) => live && setError(e));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dq]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await get(query(items.at(-1).createdAt));
      setItems((cur) => [...cur, ...d.transactions]);
      setMore(d.transactions.length === PAGE);
    } catch (e) { setError(e); } finally { setLoadingMore(false); }
  };

  const groups = [];
  for (const t of items || []) {
    const label = monthLabel(t.createdAt);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(t);
  }

  return (
    <div className="screen">
      <header className="page-head"><h1>History</h1></header>
      {filter === 'all' && !dq && <Insights />}
      <div className="search-box">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, note or UTR" aria-label="Search transactions" />
      </div>
      <div className="chips" role="tablist">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`chip ${filter === k ? 'chip--active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <ErrorBox error={error} />
      {!items && !error ? <Spinner /> : items?.length === 0 ? (
        <Empty icon="clock" title="No transactions found">{dq ? 'Try a different search.' : 'Payments you make and receive will appear here.'}</Empty>
      ) : groups.map((g) => (
        <section key={g.label} className="card card--flat">
          <h3 className="section-label">{g.label}</h3>
          <div className="list">{g.items.map((t) => <TxnRow key={t.id} txn={t} />)}</div>
        </section>
      ))}
      {more && <button className="btn btn--ghost btn--block" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
    </div>
  );
}
