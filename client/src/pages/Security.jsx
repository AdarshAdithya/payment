import { useState } from 'react';
import { patch, post } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Header } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Security() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ name: user.name, email: user.email || '' });
  const [pin, setPin] = useState({ currentPin: '', newPin: '', confirm: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const digits = (v) => v.replace(/\D/g, '').slice(0, 6);
  const run = (fn, msg, reset) => async (e) => {
    e.preventDefault();
    try { await fn(); toast(msg, 'success'); reset?.(); refresh(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="screen">
      <Header title="Profile & security" />
      <form className="card" onSubmit={run(() => patch('/me', p), 'Profile updated')}>
        <h3 className="section-label">Profile</h3>
        <label className="field"><span>Name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="field"><span>Email</span><input type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} /></label>
        <button className="btn btn--primary btn--block">Save profile</button>
      </form>
      <form className="card" onSubmit={pin.newPin !== pin.confirm ? (e) => { e.preventDefault(); toast('New PINs do not match', 'error'); }
        : run(() => post('/me/pin', { currentPin: pin.currentPin, newPin: pin.newPin }), 'UPI PIN changed', () => setPin({ currentPin: '', newPin: '', confirm: '' }))}>
        <h3 className="section-label">Change UPI PIN</h3>
        <label className="field"><span>Current PIN</span><input type="password" inputMode="numeric" value={pin.currentPin} onChange={(e) => setPin({ ...pin, currentPin: digits(e.target.value) })} required /></label>
        <div className="field-row">
          <label className="field"><span>New PIN</span><input type="password" inputMode="numeric" value={pin.newPin} onChange={(e) => setPin({ ...pin, newPin: digits(e.target.value) })} required /></label>
          <label className="field"><span>Confirm</span><input type="password" inputMode="numeric" value={pin.confirm} onChange={(e) => setPin({ ...pin, confirm: digits(e.target.value) })} required /></label>
        </div>
        <button className="btn btn--primary btn--block">Change PIN</button>
      </form>
      <form className="card" onSubmit={run(() => post('/me/password', pw), 'Password changed', () => setPw({ currentPassword: '', newPassword: '' }))}>
        <h3 className="section-label">Change password</h3>
        <label className="field"><span>Current password</span><input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
        <label className="field"><span>New password</span><input type="password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
        <button className="btn btn--primary btn--block">Change password</button>
      </form>
    </div>
  );
}
