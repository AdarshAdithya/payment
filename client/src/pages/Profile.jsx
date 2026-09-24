import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { Avatar } from '../components/ui.jsx';

const ITEMS = [
  ['/accounts', 'bank', 'Bank accounts & wallet'], ['/qr', 'qr', 'My QR code'], ['/requests', 'request', 'Payment requests'],
  ['/split', 'split', 'Split bills'], ['/bills', 'bolt', 'Recharge & bills'], ['/notifications', 'bell', 'Notifications'],
  ['/security', 'lock', 'Profile & security'],
];

export default function Profile() {
  const { user, logout } = useAuth();
  return (
    <div className="screen">
      <header className="page-head"><h1>Profile</h1></header>
      <section className="card profile-card">
        <Avatar name={user.name} color={user.avatarColor} size={64} />
        <div><h2>{user.name}</h2><p className="muted">+91 {user.phone}</p><p className="mono small">{user.upiId}</p></div>
        <Link to="/qr" className="icon-btn" aria-label="My QR"><Icon name="qr" /></Link>
      </section>
      <section className="card card--flat">
        <div className="list">
          {ITEMS.map(([to, icon, label]) => (
            <Link key={to} to={to} className="row">
              <span className="source__icon"><Icon name={icon} size={18} /></span>
              <div className="row__main"><strong>{label}</strong></div>
              <Icon name="chevron" className="muted" />
            </Link>
          ))}
          <button className="row" onClick={logout}>
            <span className="source__icon neg"><Icon name="logout" size={18} /></span>
            <div className="row__main"><strong className="neg">Log out</strong></div>
          </button>
        </div>
      </section>
      <p className="footnote">PayFlow v1.0 · Demo app, no real money moves</p>
    </div>
  );
}
