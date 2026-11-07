import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, PlayCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { forgotPassword, seedDemoAccount, DEMO_EMAIL, DEMO_PASSWORD } from '../services/api';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../services/admin';
import { seedAll } from '../services/seed';
import AuthSide from './AuthSide';
import { useLang, errText } from '../i18n/LanguageContext';

export const SocialButtons = () => {
  const { t } = useLang();
  return (
  <div className="social">
    {[
      ['Google', '#ea4335'],
      ['Microsoft', '#00a4ef'],
      ['Facebook', '#1877f2'],
    ].map(([name, color]) => (
      <button key={name} type="button" className="btn btn-outline" title={t('Continue with {name}', { name })}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} /> {name}
      </button>
    ))}
  </div>
  );
};

export default function Login() {
  const { t } = useLang();
  const { login, cart } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { seedDemoAccount(); }, []);

  const loginDemo = async (asAdmin = false, asEmail = null) => {
    seedDemoAccount(); seedAll();
    const email = asEmail || (asAdmin ? ADMIN_EMAIL : DEMO_EMAIL);
    const password = asAdmin ? ADMIN_PASSWORD : DEMO_PASSWORD;
    setForm({ email, password, remember: true });
    setError(''); setInfo(''); setLoading(true);
    try {
      await login({ email, password, remember: true });
      navigate(asAdmin ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const s = await login(form);
      const dest = s.user.role === 'SuperAdmin' ? '/admin' : location.state?.from || (cart ? '/cart' : '/dashboard');
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async () => {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { setError('Enter your email above, then click “Forgot?”.'); return; }
    const res = await forgotPassword(form.email);
    setInfo(res);
  };

  return (
    <div className="auth">
      <AuthSide title={t('Welcome back')} text={t('Sign in to manage your subscription, company and invoices.')} />
      <main className="auth-main">
        <div className="auth-card">
          <h1>{t('Sign in')}</h1>
          <p className="muted">{t('Welcome to your invoicing platform.')}</p>
          <div className="tabs">
            <Link to="/login" className="on">{t('Login')}</Link>
            <Link to="/register" state={location.state}>{t('Register')}</Link>
          </div>

          {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
          {info && <div className="alert success mb-2"><CheckCircle2 size={18} /> {t(info.key, info.vars)}</div>}

          <form onSubmit={onSubmit} noValidate className="grid" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="email">{t('Email')}</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input id="email" type="email" className="input" placeholder="you@company.com" dir="ltr" autoComplete="email"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <div className="flex between">
                <label htmlFor="password">{t('Password')}</label>
                <button type="button" onClick={onForgot} className="btn-link" style={{ background: 'none', border: 0, color: '#0f5c94', cursor: 'pointer', font: 'inherit', fontSize: 14, padding: 0 }}>
                  {t('Forgot?')}
                </button>
              </div>
              <div className="input-wrap">
                <Lock size={18} />
                <input id="password" type={showPw ? 'text' : 'password'} className="input" placeholder="••••••••" autoComplete="current-password"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" className="toggle-pw" onClick={() => setShowPw((s) => !s)} aria-label={t('Show password')}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
              {t('Remember me')}
            </label>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? <><Loader2 size={18} className="spin" /> {t('Signing in…')}</> : t('Login')}
            </button>
          </form>

          <div className="demo-row">
            <button type="button" className="demo-login" onClick={() => loginDemo(false)} disabled={loading}>
              <PlayCircle size={22} />
              <span><strong>{t('Try the demo account')}</strong><small>{t('See a fully set-up dashboard with sample data.')}</small></span>
            </button>
            <button type="button" className="demo-login demo-admin" onClick={() => loginDemo(true)} disabled={loading}>
              <ShieldCheck size={22} />
              <span><strong>{t('System admin demo')}</strong><small>{t('Sales, profit, packages, companies and support.')}</small></span>
            </button>
          </div>
          <div className="demo-roles">
            <span>{t('Sign in as a team member of ABC Trading:')}</span>
            {[['omar@abctrading.ae', 'Admin'], ['sara@abctrading.ae', 'Accountant'], ['priya@abctrading.ae', 'Viewer']].map(([em, r]) => (
              <button key={em} type="button" className="chip" onClick={() => loginDemo(false, em)} disabled={loading}>{t(r)}</button>
            ))}
          </div>

          <div className="divider">{t('or continue with')}</div>
          <SocialButtons />
          <p className="center mt-3 muted">{t('Don’t have an account?')} <Link to="/register" state={location.state}>{t('Register')}</Link></p>
        </div>
      </main>
    </div>
  );
}
