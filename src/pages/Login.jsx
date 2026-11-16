import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, PlayCircle, ShieldCheck, Handshake, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { forgotPassword, seedDemoAccount, DEMO_EMAIL, DEMO_PASSWORD } from '../services/api';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../services/admin';
import { seedAll } from '../services/seed';
import AuthSide from './AuthSide';
import { SsoButtons } from './Register';
import { useLang, errText } from '../i18n/LanguageContext';

const destFor = (s, from, cart) => {
  const r = s.user.role;
  if (r === 'Partner') return '/partner';
  if (r === 'SuperAdmin' || r === 'Staff') return s.user.staffRoles?.length === 1 && s.user.staffRoles[0] === 'Owner' ? '/admin/owner' : (s.user.staffRoles?.includes('Manager') || r === 'SuperAdmin' ? '/admin' : '/admin/tasks');
  return from || (cart ? '/cart' : '/dashboard');
};

export default function Login() {
  const { t } = useLang();
  const { login, verifyLogin, cart } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');

  useEffect(() => { seedDemoAccount(); }, []);

  const afterLogin = (s) => {
    if (s.otpRequired) { setChallenge(s); setCode(''); return; }
    navigate(destFor(s, location.state?.from, cart), { replace: true });
  };

  const loginAs = async (email, password) => {
    seedDemoAccount(); seedAll();
    setForm({ email, password, remember: true });
    setError(''); setInfo(''); setLoading(true);
    try { afterLogin(await login({ email, password, remember: true })); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try { afterLogin(await login(form)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  const onVerify = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try { afterLogin(await verifyLogin(challenge.challengeId, code)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  const onForgot = async () => {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { setError('Enter your email above, then click “Forgot?”.'); return; }
    const res = await forgotPassword(form.email);
    setInfo(res);
  };

  if (challenge) {
    return (
      <div className="auth">
        <AuthSide title={t('Two-step verification')} text={t('Your account is protected with a second step at every sign-in.')} />
        <main className="auth-main">
          <div className="auth-card">
            <h1>{t('Enter your code')}</h1>
            <p className="muted">{t('We sent a 6-digit code by {channel} to {to}.', { channel: t(challenge.channel), to: challenge.to })}</p>
            <div className="demo-code mb-2">{t('Demo: your code is {code}', { code: challenge.demoCode })}</div>
            {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
            <form onSubmit={onVerify} className="grid" style={{ gap: 14 }}>
              <div className="input-wrap"><KeyRound size={18} /><input className="input otp-input" dir="ltr" inputMode="numeric" autoFocus maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
              <button className="btn btn-primary btn-block btn-lg" disabled={loading || code.length !== 6}>{loading ? <Loader2 size={18} className="spin" /> : t('Verify and sign in')}</button>
            </form>
            <button className="link-btn mt-2" onClick={() => { setChallenge(null); setError(''); }}><ArrowLeft size={14} className="flip-rtl" /> {t('Back')}</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth">
      <AuthSide title={t('Welcome back')} text={t('Sign in to follow your account, usage and Model invoices.')} />
      <main className="auth-main">
        <div className="auth-card">
          <h1>{t('Sign in')}</h1>
          <p className="muted">{t('Customers, partners and Model staff sign in here.')}</p>
          <div className="tabs">
            <Link to="/login" className="on">{t('Login')}</Link>
            <Link to="/register" state={location.state}>{t('Register')}</Link>
          </div>

          {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
          {info && <div className="alert success mb-2"><CheckCircle2 size={18} /> {t(info.key, info.vars)}</div>}

          <form onSubmit={onSubmit} noValidate className="grid" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="email">{t('Email')}</label>
              <div className="input-wrap"><Mail size={18} />
                <input id="email" type="email" className="input" placeholder="you@company.com" dir="ltr" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <div className="flex between">
                <label htmlFor="password">{t('Password')}</label>
                <button type="button" onClick={onForgot} className="btn-link" style={{ background: 'none', border: 0, color: '#0f5c94', cursor: 'pointer', font: 'inherit', fontSize: 14, padding: 0 }}>{t('Forgot?')}</button>
              </div>
              <div className="input-wrap"><Lock size={18} />
                <input id="password" type={showPw ? 'text' : 'password'} className="input" placeholder="••••••••" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" className="toggle-pw" onClick={() => setShowPw((s) => !s)} aria-label={t('Show password')}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>
            <label className="checkbox"><input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} /> {t('Remember me')}</label>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>{loading ? <><Loader2 size={18} className="spin" /> {t('Signing in…')}</> : t('Login')}</button>
          </form>

          <div className="divider">{t('or continue with')}</div>
          <SsoButtons onPick={(name) => setInfo({ key: 'Single sign-on with {name} is connected in production. Use the demo accounts below.', vars: { name } })} />

          <div className="demo-row mt-2">
            <button type="button" className="demo-login" onClick={() => loginAs(DEMO_EMAIL, DEMO_PASSWORD)} disabled={loading}>
              <PlayCircle size={22} /><span><strong>{t('Customer demo')}</strong><small>{t('ABC Trading: active Pro plan, usage and Model invoices.')}</small></span>
            </button>
            <button type="button" className="demo-login demo-admin" onClick={() => loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)} disabled={loading}>
              <ShieldCheck size={22} /><span><strong>{t('Model manager demo')}</strong><small>{t('Tasks, customers, billing, partners, CRM and settings.')}</small></span>
            </button>
          </div>
          <div className="demo-roles">
            <span>{t('Model staff:')}</span>
            {[['cs@modelfc.ae', 'Customer Service'], ['it@modelfc.ae', 'IT'], ['sales@modelfc.ae', 'Sales'], ['owner@modelfc.ae', 'Owner']].map(([em, r]) => (
              <button key={em} type="button" className="chip" onClick={() => loginAs(em, 'Demo@2026')} disabled={loading}>{t(r)}</button>
            ))}
          </div>
          <div className="demo-roles">
            <span>{t('ABC Trading users:')}</span>
            {[['omar@abctrading.ae', 'Manager'], ['sara@abctrading.ae', 'Accountant'], ['priya@abctrading.ae', 'Viewer']].map(([em, r]) => (
              <button key={em} type="button" className="chip" onClick={() => loginAs(em, 'Demo@2026')} disabled={loading}>{t(r)}</button>
            ))}
          </div>
          <div className="demo-roles">
            <span><Handshake size={14} /> {t('Partner:')}</span>
            <button type="button" className="chip" onClick={() => loginAs('partner@almizan.ae', 'Demo@2026')} disabled={loading}>Al Mizan Accounting</button>
          </div>
          <p className="center mt-3 muted">{t('Don’t have an account?')} <Link to="/register" state={location.state}>{t('Register')}</Link> · <Link to="/partners">{t('Become a partner')}</Link></p>
        </div>
      </main>
    </div>
  );
}
