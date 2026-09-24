import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds = { phone, password }) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(creds.phone, creds.password);
      navigate(loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__hero">
        <div className="logo"><img src="/favicon.svg" alt="" width="44" height="44" /> PayFlow</div>
        <h1>Money moves,<br />in a flow.</h1>
        <p>Send money, pay bills and earn rewards with UPI.</p>
      </div>
      <form className="auth__card" onSubmit={submit}>
        <h2>Welcome back</h2>
        <label className="field">
          <span>Mobile number</span>
          <div className="field__input">
            <span className="prefix">+91</span>
            <input inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="98765 43210" required />
          </div>
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="form-error"><Icon name="alert" size={16} />{error}</div>}
        <button className="btn btn--primary btn--block" disabled={busy || phone.length !== 10 || !password}>
          {busy ? 'Signing in…' : 'Log in'}
        </button>
        <button type="button" className="btn btn--ghost btn--block" disabled={busy}
          onClick={() => submit(null, { phone: '9876543210', password: 'demo1234' })}>
          Try the demo account
        </button>
        <p className="center muted">New to PayFlow? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}
