import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import Icon from '../components/Icon.jsx';
import { Avatar, ErrorBox, Header, Spinner, TxnRow, billIcon } from '../components/ui.jsx';

export default function Bills() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || 'mobile';
  const { data, error } = useApi('/billers');
  const recent = useApi('/transactions?filter=bills&limit=5');
  const billers = data?.billers.filter((b) => b.category === category) || [];

  return (
    <div className="screen">
      <Header title="Recharge & bills" />
      <div className="bill-cats">
        {(data?.categories || []).map((c) => (
          <button key={c.id} className={`bill-cat ${c.id === category ? 'is-active' : ''}`} onClick={() => setParams({ category: c.id }, { replace: true })}>
            <span className="action__icon"><Icon name={billIcon(c.id)} /></span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      <section className="card card--flat">
        <h3 className="section-label">Choose a biller</h3>
        {!data ? <Spinner /> : (
          <div className="list">
            {billers.map((b) => (
              <Link key={b.id} to={`/bills/${b.id}`} className="row">
                <Avatar icon={billIcon(b.category)} color="#0f766e" />
                <div className="row__main"><strong>{b.name}</strong><span className="muted">{b.inputLabel}</span></div>
                <Icon name="chevron" className="muted" />
              </Link>
            ))}
          </div>
        )}
      </section>
      {recent.data?.transactions.length > 0 && (
        <section className="card card--flat">
          <h3 className="section-label">Recent bill payments</h3>
          <div className="list">{recent.data.transactions.map((t) => <TxnRow key={t.id} txn={t} />)}</div>
        </section>
      )}
    </div>
  );
}
