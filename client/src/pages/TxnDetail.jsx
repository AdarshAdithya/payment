import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { dateTime, inr, CATEGORY_LABELS } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { CounterpartyAvatar, ErrorBox, Header, Spinner, txnTitle } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function TxnDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const success = params.get('success') === '1';
  const { state } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error } = useApi(`/transactions/${id}`);
  const t = data?.transaction;

  if (error) return <div className="screen"><Header title="Transaction" /><ErrorBox error={error} /></div>;
  if (!t) return <div className="screen"><Header title="Transaction" /><Spinner /></div>;

  const receipt = [
    `PayFlow payment receipt`,
    `${txnTitle(t)}: ${inr(t.amount, { decimals: 2 })}`,
    t.note && `Note: ${t.note}`,
    `UTR: ${t.utr}`,
    `Transaction ID: ${t.id}`,
    `Date: ${dateTime(t.createdAt)}`,
    `Status: ${t.status}`,
  ].filter(Boolean).join('\n');

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'PayFlow receipt', text: receipt });
      else { await navigator.clipboard.writeText(receipt); toast('Receipt copied', 'success'); }
    } catch { /* user cancelled */ }
  };
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); toast('Copied', 'success'); } catch { /* ignore */ } };

  const rewardId = state?.rewardId || (t.reward && !t.reward.scratched ? t.reward.id : null);
  const person = t.counterparty.type === 'user' ? t.counterparty : null;

  return (
    <div className={`screen txn ${success ? 'txn--success' : ''}`}>
      {success ? (
        <div className="success-hero">
          <button className="icon-btn icon-btn--light" onClick={() => navigate('/', { replace: true })} aria-label="Close"><Icon name="x" /></button>
          <div className="success-check"><Icon name="check" size={46} stroke={3} /></div>
          <h1>{inr(t.amount, { decimals: 2 })}</h1>
          <p>{t.kind === 'bill' ? `Paid to ${t.counterparty.name}` : txnTitle(t)}</p>
          <span>{dateTime(t.createdAt)}</span>
        </div>
      ) : <Header title="Transaction details" />}

      {!success && (
        <div className="txn__hero">
          <CounterpartyAvatar txn={t} size={64} />
          <h2>{txnTitle(t)}</h2>
          <div className={`txn__amount ${t.direction === 'credit' ? 'pos' : ''}`}>{inr(t.amount, { decimals: 2 })}</div>
          <span className="badge badge--success"><Icon name="check" size={12} stroke={3} /> {t.status === 'success' ? 'Completed' : t.status}</span>
        </div>
      )}

      {rewardId && (
        <Link to="/rewards" className="banner banner--reward">
          <span className="banner__gift"><Icon name="gift" size={26} /></span>
          <span><strong>You won a scratch card!</strong><br />Tap to scratch and reveal</span>
          <Icon name="chevron" size={18} />
        </Link>
      )}

      <section className="card">
        <dl className="details">
          {t.note && <><dt>Note</dt><dd>{t.note}</dd></>}
          {t.from && <><dt>From</dt><dd>{t.from.name}<small>{t.from.upiId}</small></dd></>}
          {t.to && <><dt>To</dt><dd>{t.to.name}<small>{t.to.upiId}</small></dd></>}
          {t.kind === 'bill' && <><dt>Biller</dt><dd>{t.counterparty.name}<small>{CATEGORY_LABELS[t.category]} · {t.counterparty.reference}</small></dd></>}
          <dt>{t.direction === 'credit' ? 'Credited to' : 'Debited from'}</dt><dd>{t.account}</dd>
          <dt>UPI Ref. No (UTR)</dt><dd className="mono">{t.utr} <button className="icon-btn icon-btn--sm" onClick={() => copy(t.utr)} aria-label="Copy UTR"><Icon name="copy" size={14} /></button></dd>
          <dt>Transaction ID</dt><dd className="mono">{t.id}</dd>
          <dt>Date & time</dt><dd>{dateTime(t.createdAt)}</dd>
        </dl>
      </section>

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={share}><Icon name="share" size={18} /> Share receipt</button>
        {person && <Link className="btn btn--ghost" to={`/people/${person.id}`}><Icon name="chat" size={18} /> View history</Link>}
      </div>
      {person && t.direction === 'debit' && (
        <Link className="btn btn--primary btn--block" to={`/pay/to/${encodeURIComponent(person.upiId)}`}>Pay {person.name.split(' ')[0]} again</Link>
      )}
      {success && <button className="btn btn--ghost btn--block" onClick={() => navigate('/', { replace: true })}>Done</button>}
    </div>
  );
}
