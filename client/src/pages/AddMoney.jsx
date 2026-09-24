import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr, toPaise } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { AmountInput, Header, SourcePicker, Spinner } from '../components/ui.jsx';
import { useSecureAction } from '../components/PinPad.jsx';
import { useToast } from '../components/Toast.jsx';

export default function AddMoney() {
  const { data } = useApi('/accounts');
  const { refresh } = useAuth();
  const secure = useSecureAction();
  const toast = useToast();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState(null);
  const paise = toPaise(amount);
  useEffect(() => { if (data && !source) setSource(String((data.accounts.find((a) => a.isPrimary) || data.accounts[0])?.id)); }, [data, source]);

  const add = async () => {
    const r = await secure({ title: 'Add money to wallet', amount: paise }, (pin) => post('/accounts/wallet/topup', { accountId: Number(source), amount: paise, pin }));
    if (r) { refresh(); toast(`${inr(paise)} added to wallet`, 'success'); navigate('/', { replace: true }); }
  };

  return (
    <div className="screen">
      <Header title="Add money" subtitle="To your PayFlow wallet" />
      {!data ? <Spinner /> : (
        <section className="card">
          <p className="muted center">Wallet balance {inr(data.walletBalance, { decimals: 2 })}</p>
          <AmountInput value={amount} onChange={setAmount} autoFocus />
          <div className="quick-row quick-row--center">
            {[500, 1000, 2000, 5000].map((v) => <button key={v} className="chip" onClick={() => setAmount(String(v))}>+ ₹{v}</button>)}
          </div>
          <h3 className="section-label">From bank account</h3>
          <SourcePicker accounts={data.accounts} walletBalance={0} value={source} onChange={setSource} amount={0} hideWallet />
          <button className="btn btn--primary btn--block btn--lg" disabled={!paise || !source || source === 'wallet'} onClick={add}>Add {paise ? inr(paise) : ''}</button>
        </section>
      )}
    </div>
  );
}
