import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { forgotPassword } from '../services/api';
import AuthSide from './AuthSide';

export const SocialButtons = () => (
  <div className="social">
    {[
      ['Google', '#ea4335'],
      ['Microsoft', '#00a4ef'],
      ['Facebook', '#1877f2'],
    ].map(([name, color]) => (
      <button key={name} type="button" className="btn btn-outline" title={`Continue with ${name} (connect OAuth in backend)`}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} /> {name}
      </button>
    ))}
  </div>
);

export default function Login() {
  const { login, cart } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      await login(form);
      const dest = location.state?.from || (cart ? '/cart' : '/dashboard');
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async () => {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { setError('Enter your email above, then click “Forgot?”.'); return; }
    const res = await forgotPassword(form.email);
    setInfo(res.message);
  };

  return (
    <div className="auth">
      <AuthSide title="Welcome back" text="Sign in to manage your subscription, company and invoices." />
      <main className="auth-main">
        <div className="auth-card">
          <h1>Sign in</h1>
          <p className="muted">Welcome to your invoicing platform.</p>
          <div className="tabs">
            <Link to="/login" className="on">Login</Link>
            <Link to="/register" state={location.state}>Register</Link>
          </div>

          {error && <div className="alert error mb-2"><AlertCircle size={18} /> {error}</div>}
          {info && <div className="alert success mb-2"><CheckCircle2 size={18} /> {info}</div>}

          <form onSubmit={onSubmit} noValidate className="grid" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input id="email" type="email" className="input" placeholder="you@company.com" autoComplete="email"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <div className="flex between">
                <label htmlFor="password">Password</label>
                <button type="button" onClick={onForgot} className="btn-link" style={{ background: 'none', border: 0, color: '#1d6fe8', cursor: 'pointer', font: 'inherit', fontSize: 14, padding: 0 }}>
                  Forgot?
                </button>
              </div>
              <div className="input-wrap">
                <Lock size={18} />
                <input id="password" type={showPw ? 'text' : 'password'} className="input" placeholder="••••••••" autoComplete="current-password"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" className="toggle-pw" onClick={() => setShowPw((s) => !s)} aria-label="Show password">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
              Remember me
            </label>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? <><Loader2 size={18} className="spin" /> Signing in…</> : 'Login'}
            </button>
          </form>

          <div className="divider">or continue with</div>
          <SocialButtons />
          <p className="center mt-3 muted">Don’t have an account? <Link to="/register" state={location.state}>Register</Link></p>
        </div>
      </main>
    </div>
  );
}
