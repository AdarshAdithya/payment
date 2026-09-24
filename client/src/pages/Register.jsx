import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', pin: '', pin2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, clean = (v) => v) => (e) => setF({ ...f, [k]: clean(e.target.value) });
  const digits = (n) => (v) => v.replace(/\D/g, '').slice(0, n);

  const submit = async (e) => {
    e.preventDefault();
    if (f.pin !== f.pin2) return setError('UPI PINs do not match');
    setBusy(true);
    setError('');
    try {
      await register({ name: f.name, phone: f.phone, email: f.email || undefined, password: f.password, pin: f.pin });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__hero auth__hero--small">
        <div className="logo"><img src="/favicon.svg" alt="" width="36" height="36" /> PayFlow</div>
        <p>Create your account. We'll link a demo bank account with ₹25,000 and add ₹500 to your wallet.</p>
      </div>
      <form className="auth__card" onSubmit={submit}>
        <h2>Create account</h2>
        <label className="field"><span>Full name</span>
          <input value={f.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={60} />
        </label>
        <label className="field"><span>Mobile number</span>
          <div className="field__input"><span className="prefix">+91</span>
            <input inputMode="numeric" value={f.phone} onChange={set('phone', digits(10))} autoComplete="tel-national" required />
          </div>
        </label>
        <label className="field"><span>Email <em>(optional)</em></span>
          <input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={f.password} onChange={set('password')} minLength={8} autoComplete="new-password" required />
        </label>
        <div className="field-row">
          <label className="field"><span>Set UPI PIN</span>
            <input type="password" inputMode="numeric" value={f.pin} onChange={set('pin', digits(6))} placeholder="4 or 6 digits" required />
          </label>
          <label className="field"><span>Confirm PIN</span>
            <input type="password" inputMode="numeric" value={f.pin2} onChange={set('pin2', digits(6))} required />
          </label>
        </div>
        {error && <div className="form-error"><Icon name="alert" size={16} />{error}</div>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="center muted">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
