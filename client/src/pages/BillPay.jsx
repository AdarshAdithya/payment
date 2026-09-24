import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr, newIdemKey, toPaise } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { AmountInput, Avatar, ErrorBox, Header, SourcePicker, Spinner, billIcon } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

export default function BillPay() {
  const { billerId } = useParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const secure = useSecureAction();
  const billers = useApi('/billers');
  const accounts = useApi('/accounts');
  const biller = billers.data?.billers.find((b) => String(b.id) === billerId);
  const isMobile = biller?.category === 'mobile';
  const userAmount = biller && ['fastag', 'creditcard'].includes(biller.category);
  const plans = useApi(isMobile ? `/billers/${billerId}/plans` : null);
  const [consumer, setConsumer] = useState('');
  const [bill, setBill] = useState(null);
  const [plan, setPlan] = useState(null);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const idemKey = useMemo(() => newIdemKey(), []);

  useEffect(() => { if (isMobile && !consumer) setConsumer(user.phone); }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (accounts.data && !source) {
      const p = accounts.data.accounts.find((a) => a.isPrimary);
      setSource(p ? String(p.id) : 'wallet');
    }
  }, [accounts.data, source]);

  if (billers.error) return <div className="screen"><Header title="Pay bill" /><ErrorBox error={billers.error} /></div>;
  if (!biller) return <div className="screen"><Header title="Pay bill" /><Spinner /></div>;

  const valid = new RegExp(biller.inputPattern).test(consumer.trim().toUpperCase().replace(/\s+/g, ''));
  const payAmount = isMobile ? plan?.price : userAmount ? toPaise(amount) : bill?.bill.amount;

  const fetchBill = async () => {
    setBusy(true);
    try { setBill(await post('/bills/fetch', { billerId: biller.id, consumerNumber: consumer })); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const pay = async () => {
    const res = await secure({ title: biller.name, subtitle: consumer, amount: payAmount }, (pin) => post('/bills/pay', {
      billerId: biller.id, consumerNumber: consumer, planId: plan?.id, amount: userAmount ? payAmount : undefined,
      source: source === 'wallet' ? 'wallet' : Number(source), pin, idempotencyKey: idemKey,
    }));
    if (res) { refresh(); navigate(`/txn/${res.transaction.id}?success=1`, { replace: true, state: { rewardId: res.rewardId } }); }
  };

  const ready = payAmount > 0 && valid && (isMobile || userAmount || bill);

  return (
    <div className="screen">
      <Header title={biller.name} subtitle={isMobile ? 'Prepaid recharge' : 'Bill payment'} />
      <section className="card">
        <div className="row row--static">
          <Avatar icon={billIcon(biller.category)} color="#0f766e" />
          <div className="row__main"><strong>{biller.name}</strong><span className="muted">Instant confirmation · BBPS</span></div>
        </div>
        <label className="field"><span>{biller.inputLabel}</span>
          <input value={consumer} onChange={(e) => { setConsumer(e.target.value); setBill(null); }} autoFocus={!isMobile}
            inputMode={/\\d/.test(biller.inputPattern) && !/A-Z/.test(biller.inputPattern) ? 'numeric' : 'text'} />
        </label>
        {!valid && consumer && <p className="neg small">Enter a valid {biller.inputLabel.toLowerCase()}</p>}
        {!isMobile && !userAmount && !bill && (
          <button className="btn btn--primary btn--block" disabled={!valid || busy} onClick={fetchBill}>{busy ? 'Fetching…' : 'Fetch bill'}</button>
        )}
        {userAmount && <AmountInput value={amount} onChange={setAmount} />}
      </section>

      {bill && (
        <section className="card bill-card">
          <dl className="details">
            <dt>Customer name</dt><dd>{bill.bill.customerName}</dd>
            <dt>Bill number</dt><dd className="mono">{bill.bill.billNumber}</dd>
            <dt>Due date</dt><dd>{new Date(bill.bill.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
            <dt>Bill amount</dt><dd><strong>{inr(bill.bill.amount, { decimals: 2 })}</strong></dd>
          </dl>
        </section>
      )}

      {isMobile && (
        <section className="card card--flat">
          <h3 className="section-label">Popular plans</h3>
          {!plans.data ? <Spinner /> : (
            <div className="plans">
              {plans.data.plans.map((p) => (
                <button key={p.id} className={`plan ${plan?.id === p.id ? 'is-active' : ''}`} onClick={() => setPlan(p)}>
                  <strong>{inr(p.price)}</strong>
                  <span>{p.validity} · {p.data}</span>
                  <small className="muted">{p.perks}</small>
                  {plan?.id === p.id && <span className="plan__check"><Icon name="check" size={14} stroke={3} /></span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {ready && accounts.data && (
        <section className="card">
          <h3 className="section-label">Pay from</h3>
          <SourcePicker accounts={accounts.data.accounts} walletBalance={accounts.data.walletBalance} value={source} onChange={setSource} amount={payAmount} />
          <button className="btn btn--primary btn--block btn--lg" onClick={pay} disabled={source === 'wallet' && payAmount > accounts.data.walletBalance}>
            Pay {inr(payAmount)}
          </button>
        </section>
      )}
    </div>
  );
}
