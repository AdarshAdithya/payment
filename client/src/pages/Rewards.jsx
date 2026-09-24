import { useEffect, useRef, useState } from 'react';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { inr, timeAgo } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

function ScratchCanvas({ onDone }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const { width, height } = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#6366f1'); g.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(Math.random() * width, Math.random() * height, 2 + Math.random() * 10, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scratch here', width / 2, height / 2 + 6);
    ctx.globalCompositeOperation = 'destination-out';

    let drawing = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const scratch = (e) => {
      if (!drawing || done.current) return;
      const [x, y] = pos(e);
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
    };
    const check = () => {
      if (done.current) return;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let clear = 0;
      for (let i = 3; i < data.length; i += 64) if (data[i] === 0) clear++;
      if (clear / (data.length / 64) > 0.45) { done.current = true; onDone(); }
    };
    const down = (e) => { drawing = true; c.setPointerCapture(e.pointerId); scratch(e); };
    const up = () => { drawing = false; check(); };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', scratch);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', scratch);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, [onDone]);
  return <canvas ref={ref} className="scratch__canvas" aria-label="Scratch card, drag to reveal" />;
}

export default function Rewards() {
  const { data, error, reload } = useApi('/rewards');
  const { refresh } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(null); // { id, amount, revealed }

  const start = async (r) => {
    try {
      // The server reveals the value and credits cashback; the canvas is the reveal animation.
      const res = await post(`/rewards/${r.id}/scratch`);
      setOpen({ id: r.id, amount: res.reward.amount, revealed: false });
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };
  const close = () => { setOpen(null); reload(); };

  return (
    <div className="screen">
      <header className="page-head"><h1>Rewards</h1></header>
      <section className="reward-total">
        <Icon name="star" size={28} />
        <div><span>Total cashback earned</span><strong>{inr(data?.totalEarned ?? 0, { decimals: 2 })}</strong></div>
      </section>
      <p className="muted pad-x small">Pay ₹100 or more to anyone or any biller to win a scratch card. Cashback goes straight to your PayFlow wallet.</p>
      <ErrorBox error={error} onRetry={reload} />
      {!data && !error ? <Spinner /> : data?.rewards.length === 0 ? (
        <Empty icon="gift" title="No rewards yet">Make a payment of ₹100+ to earn your first scratch card.</Empty>
      ) : (
        <div className="reward-grid">
          {data?.rewards.map((r) => (r.scratched ? (
            <div key={r.id} className="reward reward--done">
              <Icon name={r.amount > 0 ? 'gift' : 'info'} size={26} />
              <strong>{r.amount > 0 ? inr(r.amount) : 'Better luck next time'}</strong>
              <small>{r.for ? `For ${r.for}` : ''} · {timeAgo(r.createdAt)}</small>
            </div>
          ) : (
            <button key={r.id} className="reward reward--new" onClick={() => start(r)}>
              <Icon name="gift" size={34} />
              <strong>Scratch card</strong>
              <small>{r.for ? `For paying ${r.for}` : 'Tap to scratch'}</small>
            </button>
          )))}
        </div>
      )}

      {open && (
        <div className="sheet-backdrop" onClick={open.revealed ? close : undefined}>
          <div className="scratch" onClick={(e) => e.stopPropagation()}>
            <div className="scratch__card">
              <div className="scratch__prize">
                <Icon name={open.amount > 0 ? 'gift' : 'info'} size={40} />
                {open.amount > 0 ? <><span>You won</span><strong>{inr(open.amount)}</strong><small>Cashback added to wallet</small></> : <><strong className="small-prize">Better luck next time</strong><small>Keep paying to win more</small></>}
              </div>
              {!open.revealed && <ScratchCanvas onDone={() => setOpen((o) => ({ ...o, revealed: true }))} />}
            </div>
            {open.revealed
              ? <button className="btn btn--primary btn--block" onClick={close}>Awesome!</button>
              : <button className="btn btn--ghost btn--block btn--on-dark" onClick={() => setOpen((o) => ({ ...o, revealed: true }))}>Reveal now</button>}
          </div>
        </div>
      )}
    </div>
  );
}
