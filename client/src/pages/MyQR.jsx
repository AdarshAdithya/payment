import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../lib/auth.jsx';
import { toPaise, upiUri, inr } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { AmountInput, Avatar, Header } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function MyQR() {
  const { user } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [src, setSrc] = useState('');
  const paise = toPaise(amount);
  const uri = upiUri({ pa: user.upiId, pn: user.name, am: paise ? (paise / 100).toFixed(2) : undefined });

  useEffect(() => {
    QRCode.toDataURL(uri, { width: 520, margin: 1, color: { dark: '#1e1b4b', light: '#ffffff' } }).then(setSrc);
  }, [uri]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Pay me on PayFlow', text: `Pay ${user.name} via UPI: ${user.upiId}`, url: uri });
      else { await navigator.clipboard.writeText(user.upiId); toast('UPI ID copied', 'success'); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="screen">
      <Header title="My QR code" right={<Link to="/scan" className="icon-btn" aria-label="Scan"><Icon name="scan" /></Link>} />
      <section className="card qr-card">
        <Avatar name={user.name} color={user.avatarColor} size={52} />
        <h2>{user.name}</h2>
        <p className="mono">{user.upiId}</p>
        {src && <img src={src} alt={`UPI QR code for ${user.upiId}`} className="qr-img" />}
        {paise && <p className="qr-amount">Requesting {inr(paise)}</p>}
        <p className="muted small">Scan with any UPI app to pay</p>
      </section>
      <section className="card">
        <h3 className="section-label">Request a specific amount (optional)</h3>
        <AmountInput value={amount} onChange={setAmount} />
      </section>
      <div className="btn-row">
        <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(user.upiId).then(() => toast('UPI ID copied', 'success'))}><Icon name="copy" size={18} /> Copy UPI ID</button>
        <button className="btn btn--primary" onClick={share}><Icon name="share" size={18} /> Share</button>
      </div>
    </div>
  );
}
