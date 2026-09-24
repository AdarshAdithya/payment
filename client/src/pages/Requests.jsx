import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr, timeAgo, newIdemKey } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { Avatar, Empty, ErrorBox, Header, Sheet, SourcePicker, Spinner, StatusBadge } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Requests() {
  const [tab, setTab] = useState('incoming');
  const { data, error, reload } = useApi('/requests');
  const accounts = useApi('/accounts');
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const secure = useSecureAction();
  const [paying, setPaying] = useState(null);
  const [source, setSource] = useState(null);

  const openPay = (r) => {
    const primary = accounts.data?.accounts.find((a) => a.isPrimary);
    setSource(primary ? String(primary.id) : 'wallet');
    setPaying({ ...r, key: newIdemKey() });
  };

  const pay = async () => {
    const r = paying;
    setPaying(null);
    const res = await secure({ title: `Paying ${r.requester.name}`, subtitle: r.note || r.requester.upiId, amount: r.amount },
      (pin) => post(`/requests/${r.id}/pay`, { source: source === 'wallet' ? 'wallet' : Number(source), pin, idempotencyKey: r.key }));
    if (res) { refresh(); navigate(`/txn/${res.transaction.id}?success=1`, { state: { rewardId: res.rewardId } }); }
  };

  const act = async (r, action, msg) => {
    try { await post(`/requests/${r.id}/${action}`); toast(msg); reload(); refresh(); } catch (e) { toast(e.message, 'error'); }
  };

  const list = data?.[tab] || [];

  return (
    <div className="screen">
      <Header title="Payment requests" right={<Link to="/pay?mode=request" className="icon-btn" aria-label="New request"><Icon name="plus" /></Link>} />
      <div className="segmented">
        <button className={tab === 'incoming' ? 'is-active' : ''} onClick={() => setTab('incoming')}>
          Received {data && data.incoming.filter((r) => r.status === 'pending').length > 0 && <span className="count">{data.incoming.filter((r) => r.status === 'pending').length}</span>}
        </button>
        <button className={tab === 'outgoing' ? 'is-active' : ''} onClick={() => setTab('outgoing')}>Sent</button>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {!data && !error ? <Spinner /> : list.length === 0 ? (
        <Empty icon="request" title={tab === 'incoming' ? 'No requests for you' : "You haven't requested money"}>
          {tab === 'outgoing' && <Link to="/pay?mode=request">Request money from a friend</Link>}
        </Empty>
      ) : (
        <div className="stack">
          {list.map((r) => {
            const other = tab === 'incoming' ? r.requester : r.payer;
            return (
              <div key={r.id} className="card request-card">
                <div className="row row--static">
                  <Avatar name={other.name} color={other.avatarColor} />
                  <div className="row__main">
                    <strong>{tab === 'incoming' ? `${other.name} requested` : `Requested from ${other.name}`}</strong>
                    <span className="muted">{r.note || other.upiId} · {timeAgo(r.createdAt)}</span>
                  </div>
                  <div className="row__amount">{inr(r.amount)}</div>
                </div>
                <div className="request-card__foot">
                  <StatusBadge status={r.status} />
                  {r.status === 'pending' && tab === 'incoming' && (
                    <div className="btn-row btn-row--tight">
                      <button className="btn btn--sm btn--ghost" onClick={() => act(r, 'decline', 'Request declined')}>Decline</button>
                      <button className="btn btn--sm btn--primary" onClick={() => openPay(r)}>Pay</button>
                    </div>
                  )}
                  {r.status === 'pending' && tab === 'outgoing' && (
                    <button className="btn btn--sm btn--ghost" onClick={() => act(r, 'cancel', 'Request cancelled')}>Cancel</button>
                  )}
                  {r.status === 'paid' && r.transactionId && <Link to={`/txn/${r.transactionId}`} className="link">View payment</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Sheet open={!!paying} onClose={() => setPaying(null)} title={paying ? `Pay ${inr(paying.amount)} to ${paying.requester.name}` : ''}>
        {paying && accounts.data && (
          <>
            <SourcePicker accounts={accounts.data.accounts} walletBalance={accounts.data.walletBalance} value={source} onChange={setSource} amount={paying.amount} />
            <button className="btn btn--primary btn--block btn--lg" onClick={pay}
              disabled={source === 'wallet' && paying.amount > accounts.data.walletBalance}>Proceed to pay</button>
          </>
        )}
      </Sheet>
    </div>
  );
}
