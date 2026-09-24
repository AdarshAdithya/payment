import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { parseUpi } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Header, Spinner } from '../components/ui.jsx';

export default function PaySearch() {
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'request' ? 'request' : 'pay';
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const contacts = useApi('/contacts');
  const results = useApi(dq.length >= 2 ? `/users/search?q=${encodeURIComponent(dq)}` : null);
  const handle = parseUpi(q);
  const suffix = mode === 'request' ? '?mode=request' : '';
  const go = (upiId) => navigate(`/pay/to/${encodeURIComponent(upiId)}${suffix}`);

  const verify = async (e) => {
    e?.preventDefault();
    if (!handle) return;
    setVerifying(true);
    setError('');
    try {
      const { user } = await get(`/users/resolve?handle=${encodeURIComponent(handle.pa)}`);
      if (user.isSelf) setError("That's your own UPI ID");
      else go(user.upiId);
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const list = dq.length >= 2 ? results.data?.users : contacts.data?.contacts;

  return (
    <div className="screen">
      <Header title={mode === 'request' ? 'Request money' : 'Send money'} subtitle="To any UPI ID or PayFlow contact" />
      <form className="search-box" onSubmit={verify}>
        <Icon name="search" size={18} />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setError(''); }}
          placeholder="Name, mobile number or UPI ID" aria-label="Search payee" />
        {q && <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><Icon name="x" size={18} /></button>}
      </form>
      {handle && (
        <button className="row row--cta" onClick={verify} disabled={verifying}>
          <span className="avatar avatar--outline" style={{ width: 44, height: 44 }}><Icon name="at" /></span>
          <div className="row__main"><strong>{mode === 'request' ? 'Request from' : 'Pay'} {handle.pa}</strong>
            <span className="muted">{verifying ? 'Verifying…' : 'Tap to verify and continue'}</span></div>
          <Icon name="chevron" />
        </button>
      )}
      {error && <div className="form-error form-error--pad"><Icon name="alert" size={16} />{error}</div>}
      {mode === 'pay' && !q && (
        <div className="quick-row">
          <Link to="/scan" className="chip"><Icon name="scan" size={16} /> Scan QR</Link>
          <Link to="/pay?mode=request" className="chip"><Icon name="request" size={16} /> Request instead</Link>
          <Link to="/split" className="chip"><Icon name="split" size={16} /> Split a bill</Link>
        </div>
      )}
      <section className="card card--flat">
        <h3 className="section-label">{dq.length >= 2 ? 'Search results' : 'Recent'}</h3>
        {(results.loading || contacts.loading) && !list ? <Spinner /> : list?.length ? (
          <div className="list">
            {list.map((u) => (
              <button key={u.id} className="row" onClick={() => go(u.upiId)}>
                <Avatar name={u.name} color={u.avatarColor} />
                <div className="row__main"><strong>{u.name}</strong><span className="muted">{u.upiId}</span></div>
                <Icon name="chevron" className="muted" />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted pad">{dq.length >= 2 ? 'No PayFlow users found. Try a full UPI ID or 10-digit number.' : 'No recent contacts yet. Try searching “Priya” or “Rohan”.'}</p>
        )}
      </section>
    </div>
  );
}
