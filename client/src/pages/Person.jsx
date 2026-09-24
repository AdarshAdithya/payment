import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr, shortTime, newIdemKey } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { Avatar, ErrorBox, Header, Spinner, StatusBadge } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Person() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();
  const secure = useSecureAction();
  const { data, error, reload } = useApi(`/contacts/${id}/activity`);
  const accounts = useApi('/accounts');
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [data]);

  if (error) return <div className="screen"><Header title="" /><ErrorBox error={error} /></div>;
  if (!data) return <div className="screen"><Header title="" /><Spinner /></div>;
  const u = data.user;

  const payRequest = async (r) => {
    const primary = accounts.data?.accounts.find((a) => a.isPrimary);
    const source = primary ? primary.id : 'wallet';
    const key = newIdemKey();
    const res = await secure({ title: `Paying ${u.name}`, subtitle: r.note || 'Payment request', amount: r.amount },
      (pin) => post(`/requests/${r.id}/pay`, { source, pin, idempotencyKey: key }));
    if (res) { refresh(); navigate(`/txn/${res.transaction.id}?success=1`, { state: { rewardId: res.rewardId } }); }
  };
  const decline = async (r) => {
    try { await post(`/requests/${r.id}/decline`); toast('Request declined'); reload(); refresh(); } catch (e) { toast(e.message, 'error'); }
  };
  const cancel = async (r) => {
    try { await post(`/requests/${r.id}/cancel`); toast('Request cancelled'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="screen chat">
      <Header title={u.name} subtitle={u.upiId} right={<Avatar name={u.name} color={u.avatarColor} size={36} />} />
      <div className="chat__body">
        {data.items.length === 0 && <p className="muted center pad">No payments with {u.name.split(' ')[0]} yet. Say hi with a payment!</p>}
        {data.items.map((item) => {
          if (item.type === 'txn') {
            const t = item.txn;
            const mine = t.direction === 'debit';
            return (
              <Link key={t.id} to={`/txn/${t.id}`} className={`bubble ${mine ? 'bubble--me' : ''}`}>
                <span className="bubble__label">{mine ? `Payment to ${u.name.split(' ')[0]}` : 'Payment to you'}</span>
                <strong className="bubble__amount">{inr(t.amount)}</strong>
                {t.note && <span className="bubble__note">{t.note}</span>}
                <span className="bubble__meta"><Icon name="check" size={12} stroke={3} /> Paid · {shortTime(t.createdAt)}</span>
              </Link>
            );
          }
          const r = item.request;
          return (
            <div key={`r${r.id}`} className={`bubble bubble--request ${r.outgoing ? 'bubble--me' : ''}`}>
              <span className="bubble__label">{r.outgoing ? 'You requested' : `${u.name.split(' ')[0]} requested`}</span>
              <strong className="bubble__amount">{inr(r.amount)}</strong>
              {r.note && <span className="bubble__note">{r.note}</span>}
              <span className="bubble__meta"><StatusBadge status={r.status} /> {shortTime(r.createdAt)}</span>
              {r.status === 'pending' && (r.outgoing ? (
                <div className="bubble__actions"><button className="btn btn--sm btn--ghost" onClick={() => cancel(r)}>Cancel request</button></div>
              ) : (
                <div className="bubble__actions">
                  <button className="btn btn--sm btn--ghost" onClick={() => decline(r)}>Decline</button>
                  <button className="btn btn--sm btn--primary" onClick={() => payRequest(r)}>Pay</button>
                </div>
              ))}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="chat__bar">
        <Link className="btn btn--primary" to={`/pay/to/${encodeURIComponent(u.upiId)}`}><Icon name="arrowUp" size={18} /> Pay</Link>
        <Link className="btn btn--ghost" to={`/pay/to/${encodeURIComponent(u.upiId)}?mode=request`}><Icon name="request" size={18} /> Request</Link>
      </div>
    </div>
  );
}
