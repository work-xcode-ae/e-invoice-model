import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthSide from './AuthSide';
import { SocialButtons } from './Login';
import { useLang, errText } from '../i18n/LanguageContext';

const strength = (pw) => {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
};
const meterColors = ['#e2e8f0', '#dc2626', '#f59e0b', '#1f7fb5', '#16a34a'];
const meterLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export default function Register() {
  const { t } = useLang();
  const { register, cart } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '', terms: false });
  const [errors, setErrors] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const score = strength(form.password);

  const validate = () => {
    const e = {};
    if (form.fullName.trim().length < 3) e.fullName = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (form.phone && !/^\+?[\d\s-]{8,15}$/.test(form.phone)) e.phone = 'Enter a valid phone number.';
    if (score < 3) e.password = 'Use 8+ characters with upper & lower case letters and a number.';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match.';
    if (!form.terms) e.terms = 'You must accept the terms to continue.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await register(form);
      navigate(location.state?.from || (cart ? '/cart' : '/packages'), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ id, label, icon: Icon, type = 'text', placeholder, auto }) => (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <div className="input-wrap">
        <Icon size={18} />
        <input id={id} type={type} className={`input ${errors[id] ? 'invalid' : ''}`} placeholder={t(placeholder)}
          dir={type === 'email' || id === 'phone' ? 'ltr' : undefined}
          autoComplete={auto} value={form[id]} onChange={set(id)} />
      </div>
      {errors[id] && <span className="err">{t(errors[id])}</span>}
    </div>
  );

  return (
    <div className="auth">
      <AuthSide title={t('Start e-invoicing today')} text={t('Create your account, choose a package and set up your company in minutes.')} />
      <main className="auth-main">
        <div className="auth-card">
          <h1>{t('Create your account')}</h1>
          <p className="muted">{t('It only takes a minute.')}</p>
          <div className="tabs">
            <Link to="/login" state={location.state}>{t('Login')}</Link>
            <Link to="/register" className="on">{t('Register')}</Link>
          </div>

          {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}

          <form onSubmit={onSubmit} noValidate className="grid" style={{ gap: 16 }}>
            {Field({ id: 'fullName', label: 'Full name', icon: User, placeholder: 'Ahmed Ali', auto: 'name' })}
            {Field({ id: 'email', label: 'Work email', icon: Mail, type: 'email', placeholder: 'you@company.com', auto: 'email' })}
            {Field({ id: 'phone', label: 'Mobile (optional)', icon: Phone, placeholder: '+971 5X XXX XXXX', auto: 'tel' })}

            <div className="field">
              <label htmlFor="password">{t('Password')}</label>
              <div className="input-wrap">
                <Lock size={18} />
                <input id="password" type={showPw ? 'text' : 'password'} className={`input ${errors.password ? 'invalid' : ''}`}
                  autoComplete="new-password" value={form.password} onChange={set('password')} placeholder={t('At least 8 characters')} />
                <button type="button" className="toggle-pw" onClick={() => setShowPw((s) => !s)} aria-label={t('Show password')}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {form.password && (
                <>
                  <div className="pw-meter">
                    {[1, 2, 3, 4].map((i) => <span key={i} style={{ background: i <= score ? meterColors[score] : undefined }} />)}
                  </div>
                  <span className="hint">{t(meterLabels[score])}</span>
                </>
              )}
              {errors.password && <span className="err">{t(errors.password)}</span>}
            </div>
            <div className="field">
              <label htmlFor="confirm">{t('Confirm password')}</label>
              <div className="input-wrap">
                <Lock size={18} />
                <input id="confirm" type={showPw ? 'text' : 'password'} className={`input ${errors.confirm ? 'invalid' : ''}`}
                  autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
              </div>
              {errors.confirm && <span className="err">{t(errors.confirm)}</span>}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={form.terms} onChange={set('terms')} />
              <span>{t('I agree to the')} <a href="#terms">{t('Terms of Service')}</a> {t('and')} <a href="#privacy">{t('Privacy Policy')}</a>.</span>
            </label>
            {errors.terms && <span className="err" style={{ marginTop: -10 }}>{t(errors.terms)}</span>}

            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? <><Loader2 size={18} className="spin" /> {t('Creating account…')}</> : t('Create account')}
            </button>
          </form>

          <div className="divider">{t('or sign up with')}</div>
          <SocialButtons />
          <p className="center mt-3 muted">{t('Already have an account?')} <Link to="/login" state={location.state}>{t('Login')}</Link></p>
        </div>
      </main>
    </div>
  );
}
