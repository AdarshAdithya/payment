import { useState } from 'react';
import { post } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { inr, toPaise } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { AmountInput, Avatar, Empty, Header, Spinner, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Split() {
  const toast = useToast();
  const contacts = useApi('/contacts');
  const splits = useApi('/splits');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [people, setPeople] = useState([]);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q.trim());
  const search = useApi(dq.length >= 2 ? `/users/search?q=${encodeURIComponent(dq)}` : null);

  const total = toPaise(amount);
  const n = people.length + (includeSelf ? 1 : 0);
  const share = total && n ? Math.floor(total / n) : 0;
  const toggle = (u) => setPeople((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  const suggestions = (dq.length >= 2 ? search.data?.users : contacts.data?.contacts) || [];

  const create = async () => {
    setBusy(true);
    try {
      await post('/splits', { title, total, participants: people.map((p) => p.upiId), includeSelf });
      toast(`Sent ${people.length} request${people.length > 1 ? 's' : ''} of ${inr(share)}`, 'success');
      setTitle(''); setAmount(''); setPeople([]); setQ('');
      splits.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <Header title="Split a bill" subtitle="Split equally and send requests" />
      <section className="card">
        <label className="field"><span>What's it for?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner, trip, rent…" maxLength={60} />
        </label>
        <AmountInput value={amount} onChange={setAmount} />
        <h3 className="section-label">Split with</h3>
        {people.length > 0 && (
          <div className="selected">
            {people.map((p) => (
              <button key={p.id} className="chip chip--active" onClick={() => toggle(p)}>{p.name.split(' ')[0]} <Icon name="x" size={14} /></button>
            ))}
          </div>
        )}
        <div className="search-box search-box--inset">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add people by name or number" />
        </div>
        <div className="list list--compact">
          {suggestions.slice(0, 6).map((u) => {
            const on = people.some((p) => p.id === u.id);
            return (
              <button key={u.id} className="row" onClick={() => toggle(u)}>
                <Avatar name={u.name} color={u.avatarColor} size={36} />
                <div className="row__main"><strong>{u.name}</strong><span className="muted">{u.upiId}</span></div>
                <span className={`checkbox ${on ? 'on' : ''}`}>{on && <Icon name="check" size={14} stroke={3} />}</span>
              </button>
            );
          })}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={includeSelf} onChange={(e) => setIncludeSelf(e.target.checked)} />
          <span>Include my share</span>
        </label>
        {share > 0 && people.length > 0 && (
          <div className="split-summary">
            <span>{n} people · each pays</span><strong>{inr(share, { decimals: 2 })}</strong>
          </div>
        )}
        <button className="btn btn--primary btn--block" disabled={busy || !total || !people.length || title.trim().length < 2 || share < 1} onClick={create}>
          {busy ? 'Sending…' : `Send ${people.length || ''} request${people.length === 1 ? '' : 's'}`}
        </button>
      </section>

      <h3 className="section-label pad-x">Your splits</h3>
      {splits.loading && !splits.data ? <Spinner /> : !splits.data?.splits.length ? (
        <Empty icon="split" title="No splits yet">Split a bill above to track who has paid.</Empty>
      ) : splits.data.splits.map((s) => (
        <section key={s.id} className="card">
          <div className="card__head">
            <div><h2>{s.title}</h2><span className="muted">by {s.creator.name} · {inr(s.total)}</span></div>
            <strong className="pos">{inr(s.collected)}</strong>
          </div>
          <div className="progress"><span style={{ width: `${(s.collected / Math.max(1, s.collected + s.pending)) * 100}%` }} /></div>
          <div className="list list--compact">
            {s.requests.map((r) => (
              <div key={r.id} className="row row--static">
                <Avatar name={r.payer.name} color={r.payer.avatarColor} size={32} />
                <div className="row__main"><strong>{r.payer.name}</strong></div>
                <span>{inr(r.amount)}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
