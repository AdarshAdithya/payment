import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr, toPaise, newIdemKey } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { AmountInput, Avatar, ErrorBox, Header, SourcePicker, Spinner } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

export default function PayAmount() {
  const { handle } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'request' ? 'request' : 'pay';
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();
  const secure = useSecureAction();
  const payee = useApi(`/users/resolve?handle=${encodeURIComponent(handle)}`);
  const accounts = useApi(mode === 'pay' ? '/accounts' : null);
  const [amount, setAmount] = useState(params.get('am') || '');
  const [note, setNote] = useState(params.get('tn') || '');
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const idemKey = useMemo(() => newIdemKey(), []);
  const paise = toPaise(amount);
  const fixedAmount = !!params.get('am'); // merchant QR with amount

  useEffect(() => {
    if (accounts.data && !source) {
      const primary = accounts.data.accounts.find((a) => a.isPrimary);
      setSource(primary ? String(primary.id) : 'wallet');
    }
  }, [accounts.data, source]);

  const u = payee.data?.user;

  const submit = async () => {
    if (!paise || busy) return;
    setBusy(true);
    try {
      if (mode === 'request') {
        await post('/requests', { from: u.upiId, amount: paise, note });
        toast(`Requested ${inr(paise)} from ${u.name}`, 'success');
        navigate(`/people/${u.id}`, { replace: true });
        return;
      }
      const res = await secure(
        { title: `Paying ${u.name}`, subtitle: u.upiId, amount: paise },
        (pin) => post('/payments', { to: u.upiId, amount: paise, note, source: source === 'wallet' ? 'wallet' : Number(source), pin, idempotencyKey: idemKey }),
      );
      if (res) {
        refresh();
        navigate(`/txn/${res.transaction.id}?success=1`, { replace: true, state: { rewardId: res.rewardId } });
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (payee.error) return <div className="screen"><Header title="Pay" /><ErrorBox error={payee.error} /></div>;
  if (!u) return <div className="screen"><Header title="" /><Spinner /></div>;
  if (u.isSelf) return <div className="screen"><Header title="Pay" /><ErrorBox error={{ message: 'You cannot pay yourself.' }} /></div>;

  const walletShort = source === 'wallet' && paise > (accounts.data?.walletBalance ?? 0);

  return (
    <div className="screen pay">
      <Header title="" right={<Link to={`/people/${u.id}`} className="icon-btn" aria-label="Chat"><Icon name="chat" /></Link>} />
      <div className="pay__payee">
        <Avatar name={u.name} color={u.avatarColor} size={68} />
        <h2>{mode === 'request' ? `Requesting from ${u.name}` : `Paying ${u.name}`}</h2>
        <p className="muted"><Icon name="check" size={14} className="pos" /> {u.upiId} · {u.phone}</p>
      </div>
      <AmountInput value={amount} onChange={setAmount} autoFocus={!fixedAmount} readOnly={fixedAmount} />
      {paise > 100000_00 && <p className="neg center">Maximum ₹1,00,000 per transaction</p>}
      <input className="note-input" placeholder="Add a note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
      {!fixedAmount && (
        <div className="quick-row quick-row--center">
          {[100, 200, 500, 1000].map((v) => (
            <button key={v} className="chip" onClick={() => setAmount(String(v))}>₹{v}</button>
          ))}
        </div>
      )}
      <div className="pay__bottom">
        {mode === 'pay' && (accounts.data ? (
          <>
            <h3 className="section-label">Pay from</h3>
            <SourcePicker accounts={accounts.data.accounts} walletBalance={accounts.data.walletBalance} value={source} onChange={setSource} amount={paise || 0} />
          </>
        ) : <Spinner />)}
        <button className="btn btn--primary btn--block btn--lg" onClick={submit}
          disabled={!paise || paise > 100000_00 || busy || walletShort || (mode === 'pay' && !source)}>
          {busy ? 'Processing…' : mode === 'request' ? `Request ${paise ? inr(paise) : ''}` : `Pay ${paise ? inr(paise) : ''}`}
        </button>
      </div>
    </div>
  );
}
