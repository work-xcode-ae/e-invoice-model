// Registration (REG-01..REG-04): new customer from the site or a partner link, or an existing Model client
// from an invitation with prefilled data. Corporate email verified with a code; Google / Microsoft sign-in
// (no Facebook); company data with format checks and a unique licence; terms accepted by version.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowLeft, ArrowRight, Building2, Sparkles, Handshake, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthSide from './AuthSide';
import { useLang, errText } from '../i18n/LanguageContext';
import { sendOtp, verifyOtp, getUsers } from '../services/api';
import { getPlatform, currentPolicy } from '../services/platform';
import { leadByInvite, inviteOpened, inviteRegistered } from '../services/crm';
import { activeReferral, partnerByCode, captureReferral } from '../services/partners';
import { packages, getPackage, formatMoney } from '../data/packages';

const strength = (pw) => {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
};

export const SsoButtons = ({ onPick }) => {
  const { t } = useLang();
  return (
    <div className="social">
      {[['Google', '#ea4335'], ['Microsoft', '#00a4ef']].map(([name, color]) => (
        <button key={name} type="button" className="btn btn-outline" title={t('Continue with {name}', { name })} onClick={() => onPick?.(name)}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} /> {name}
        </button>
      ))}
    </div>
  );
};

const suggest = (volumeId) => {
  const v = getPlatform().registration.volumes.find((x) => x.id === volumeId);
  if (!v) return null;
  if (v.monthly > 500) return getPackage('enterprise');
  if (v.monthly <= 8) return getPackage('freemium');
  return packages.filter((p) => !p.custom && p.active !== false).find((p) => Number(p.transactions) >= v.monthly) || getPackage('premium');
};

export default function Register() {
  const { t, lang } = useLang();
  const { register, cart, setCart } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const p = getPlatform();
  const reg = p.registration;
  const inviteToken = params.get('invite');
  const invite = useMemo(() => (inviteToken ? leadByInvite(inviteToken) : null), [inviteToken]);
  useEffect(() => { if (inviteToken) inviteOpened(inviteToken); if (params.get('ref')) captureReferral(params.get('ref')); }, [inviteToken, params]);
  const ref = activeReferral();

  const [step, setStep] = useState(0);
  const [method, setMethod] = useState('Password');
  const [a, setA] = useState({
    fullName: invite?.name || params.get('name') || '', email: invite?.email || params.get('email') || '', phone: invite?.phone || '', password: '', confirm: '',
    partnerCode: params.get('ref') || ref?.code || '',
  });
  const [c, setC] = useState({
    legalName: invite?.company ? `${invite.company}` : params.get('company') || '', name: invite?.company || params.get('company') || '',
    tradeLicense: invite?.tradeLicense || '', licenceIssuer: '', licenceExpiry: '', activity: '', tin: '', trn: invite?.trn || '', vatRegistered: true,
    emirate: '', street: '', city: '', emaraTaxEmail: '', sendingMethod: reg.sendingMethods[0], volume: '',
  });
  const [accept, setAccept] = useState({ terms: false, disclaimer: false });
  const [otp, setOtp] = useState(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAf = (k) => (e) => setA((x) => ({ ...x, [k]: e.target.value }));
  const setCf = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const domain = a.email.split('@')[1]?.toLowerCase();
  const pkgSuggestion = suggest(c.volume);
  const terms = currentPolicy('terms');
  const disclaimer = currentPolicy('disclaimer');

  const pickSso = (provider) => {
    setMethod(provider);
    setVerified(true); // the identity provider has already verified the email
    setA((x) => ({ ...x, fullName: x.fullName || (provider === 'Google' ? 'Google user' : 'Microsoft user'), password: 'Sso!Login2026', confirm: 'Sso!Login2026' }));
    setErrors({});
  };

  const validateAccount = () => {
    const e = {};
    if (a.fullName.trim().length < 3) e.fullName = 'Enter the authorised person’s full name.';
    if (!/^\S+@\S+\.\S+$/.test(a.email)) e.email = 'Enter a valid email address.';
    else if (reg.blockFreeEmail && reg.freeEmailDomains.includes(domain)) e.email = 'Use your company email, not a personal one ({domain}).';
    else if (getUsers().some((u) => u.email.toLowerCase() === a.email.toLowerCase())) e.email = 'An account with this email already exists.';
    if (!/^\+?[\d\s-]{8,15}$/.test(a.phone)) e.phone = 'Enter a valid mobile number.';
    if (method === 'Password') {
      if (strength(a.password) < 3) e.password = 'Use 8+ characters with upper & lower case letters and a number.';
      if (a.confirm !== a.password) e.confirm = 'Passwords do not match.';
    }
    if (a.partnerCode && !partnerByCode(a.partnerCode)) e.partnerCode = 'This partner code is not valid.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const sendCode = () => { if (!validateAccount()) return; setOtp(sendOtp({ to: a.email, channel: 'Email', purpose: 'register' })); setCode(''); setError(''); };
  const checkCode = () => { try { verifyOtp(otp.challengeId, code); setVerified(true); setOtp(null); setStep(1); } catch (er) { setError(er); } };

  const validateCompany = () => {
    const e = {};
    if (!c.legalName.trim()) e.legalName = 'Enter the legal name.';
    if (!c.name.trim()) e.name = 'Enter the trade name.';
    if (!c.tradeLicense.trim()) e.tradeLicense = 'Enter the trade licence number.';
    else if (getUsers().some((u) => u.company?.tradeLicense?.trim().toLowerCase() === c.tradeLicense.trim().toLowerCase())) e.tradeLicense = 'A company with this trade licence is already registered.';
    if (!c.licenceIssuer) e.licenceIssuer = 'Choose the issuing authority.';
    if (!c.licenceExpiry) e.licenceExpiry = 'Enter the expiry date.';
    else if (c.licenceExpiry <= new Date().toISOString().slice(0, 10)) e.licenceExpiry = 'The licence has expired. Renew it first.';
    if (!c.activity) e.activity = 'Choose the business activity.';
    if (!/^\d{10}$/.test(c.tin)) e.tin = 'TIN must be 10 digits.';
    if (c.vatRegistered && !/^\d{15}$/.test(c.trn)) e.trn = 'TRN must be 15 digits.';
    if (c.vatRegistered && /^\d{15}$/.test(c.trn) && /^\d{10}$/.test(c.tin) && !c.trn.startsWith(c.tin)) e.trn = 'The TRN should start with your 10-digit TIN.';
    if (!c.emirate) e.emirate = 'Choose the emirate.';
    if (!c.street.trim()) e.street = 'Enter the address.';
    if (!/^\S+@\S+\.\S+$/.test(c.emaraTaxEmail)) e.emaraTaxEmail = 'Enter the email registered in EmaraTax.';
    if (!c.volume) e.volume = 'Choose your expected volume.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const next = () => {
    setError('');
    if (step === 0) { if (!validateAccount()) return; if (!verified) { sendCode(); return; } setStep(1); }
    else if (step === 1) { if (validateCompany()) setStep(2); }
  };

  const submit = async () => {
    if (!accept.terms || !accept.disclaimer) { setError('You must accept the terms to continue.'); return; }
    setLoading(true); setError('');
    try {
      const now = new Date().toISOString();
      const partner = a.partnerCode ? partnerByCode(a.partnerCode) : null;
      const s = await register({
        fullName: a.fullName, email: a.email.trim().toLowerCase(), phone: a.phone, password: a.password, method,
        company: { ...c, trn: c.vatRegistered ? c.trn : '', city: c.city || c.emirate, country: 'AE' },
        acceptances: [{ doc: 'terms', version: terms.version, at: now }, { doc: 'disclaimer', version: disclaimer.version, at: now }],
        referral: partner ? { code: partner.code, method: a.partnerCode === ref?.code ? 'Link' : 'Code' } : null,
        inviteToken,
      });
      if (inviteToken) inviteRegistered(inviteToken, s.user.id);
      const chosen = params.get('package') && getPackage(params.get('package'));
      const pkg = chosen || (cart ? null : pkgSuggestion);
      if (pkg && !pkg.custom) setCart({ type: 'package', packageId: pkg.id, months: 1 });
      navigate(location.state?.from || (pkg?.custom ? '/contact?enterprise=1' : '/cart'), { replace: true });
    } catch (err) { setError(err); } finally { setLoading(false); }
  };

  const F = ({ id, label, icon: Icon, type = 'text', obj = 'a', ltr, placeholder, hint }) => {
    const val = obj === 'a' ? a[id] : c[id];
    const on = obj === 'a' ? setAf(id) : setCf(id);
    return (
      <div className="field">
        <label htmlFor={id}>{t(label)}</label>
        <div className={Icon ? 'input-wrap' : ''}>
          {Icon && <Icon size={18} />}
          <input id={id} type={type === 'password' && showPw ? 'text' : type} className={`input ${errors[id] ? 'invalid' : ''}`} dir={ltr ? 'ltr' : undefined} placeholder={placeholder} value={val} onChange={on} />
        </div>
        {errors[id] ? <span className="err">{t(errors[id], { domain })}</span> : hint ? <span className="hint">{t(hint)}</span> : null}
      </div>
    );
  };
  const S = ({ id, label, options }) => (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <select id={id} className={`input ${errors[id] ? 'invalid' : ''}`} value={c[id]} onChange={setCf(id)}>
        <option value="">—</option>
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{t(o)}</option> : <option key={o.id} value={o.id}>{t(o.label)}</option>))}
      </select>
      {errors[id] && <span className="err">{t(errors[id])}</span>}
    </div>
  );

  return (
    <div className="auth">
      <AuthSide title={t('Start e-invoicing today')} text={t('Create your account, add your company and choose a package. Nothing is submitted until you pay.')} />
      <main className="auth-main">
        <div className="auth-card" style={{ maxWidth: step === 1 ? 640 : undefined }}>
          <h1>{t(['Create your account', 'Your company', 'Terms and disclaimer'][step])}</h1>
          <div className="reg-steps">{[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
          {invite && step === 0 && <div className="alert info mb-2"><MailCheck size={18} /> {t('Welcome back. We filled in what we already know — just review it.')}</div>}
          {(ref || a.partnerCode) && partnerByCode(a.partnerCode || ref?.code) && step === 0 && <div className="alert success mb-2"><Handshake size={18} /> {t('Referred by {name}', { name: partnerByCode(a.partnerCode || ref?.code).name })}</div>}
          {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}

          {step === 0 && (
            <>
              {!invite && <><SsoButtons onPick={pickSso} /><div className="divider">{t('or with your company email')}</div></>}
              {method !== 'Password' && <div className="alert success mb-2"><CheckCircle2 size={18} /> {t('Signed in with {name}. Complete the details below.', { name: method })}</div>}
              <div className="grid" style={{ gap: 14 }}>
                {F({ id: 'fullName', label: 'Authorised person’s full name', icon: User })}
                {F({ id: 'email', label: 'Company email', icon: Mail, type: 'email', ltr: true, placeholder: 'you@company.ae' })}
                {F({ id: 'phone', label: 'Mobile', icon: Phone, ltr: true, placeholder: '+971 50 123 4567' })}
                {method === 'Password' && <>
                  <div className="field">
                    <label htmlFor="password">{t('Password')}</label>
                    <div className="input-wrap"><Lock size={18} /><input id="password" type={showPw ? 'text' : 'password'} className={`input ${errors.password ? 'invalid' : ''}`} value={a.password} onChange={setAf('password')} />
                      <button type="button" className="toggle-pw" onClick={() => setShowPw((x) => !x)} aria-label={t('Show password')}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                    {errors.password && <span className="err">{t(errors.password)}</span>}
                  </div>
                  {F({ id: 'confirm', label: 'Confirm password', icon: Lock, type: 'password' })}
                </>}
                {F({ id: 'partnerCode', label: 'Partner code (optional)', icon: Handshake, ltr: true })}
              </div>
              {otp && (
                <div className="card-soft mt-2">
                  <b>{t('Enter the 6-digit code we sent to {email}', { email: a.email })}</b>
                  <div className="demo-code mt-1">{t('Demo: your code is {code}', { code: otp.demoCode })}</div>
                  <div className="flex gap-1 mt-1">
                    <input className="input otp-input" dir="ltr" maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                    <button type="button" className="btn btn-primary" onClick={checkCode} disabled={code.length !== 6}>{t('Verify')}</button>
                  </div>
                  <button type="button" className="link-btn mt-1" onClick={sendCode}>{t('Send a new code')}</button>
                </div>
              )}
              {!otp && <button className="btn btn-primary btn-block btn-lg mt-2" onClick={next}>{verified ? t('Continue') : t('Verify email')} <ArrowRight size={16} className="flip-rtl" /></button>}
              <p className="center mt-3 muted">{t('Already have an account?')} <Link to="/login">{t('Login')}</Link></p>
            </>
          )}

          {step === 1 && (
            <>
              <div className="form-grid">
                {F({ id: 'legalName', label: 'Legal name', obj: 'c' })}
                {F({ id: 'name', label: 'Trade name', obj: 'c' })}
                {F({ id: 'tradeLicense', label: 'Trade licence number', obj: 'c', ltr: true })}
                {S({ id: 'licenceIssuer', label: 'Issuing authority', options: reg.licenceIssuers })}
                {F({ id: 'licenceExpiry', label: 'Licence expiry date', obj: 'c', type: 'date', ltr: true })}
                {S({ id: 'activity', label: 'Business activity', options: reg.activities })}
                {F({ id: 'tin', label: 'TIN (10 digits)', obj: 'c', ltr: true, placeholder: '1001234567', hint: 'Your Peppol ID will be 0235:TIN.' })}
                <div className="field">
                  <label htmlFor="trn">{t('TRN (15 digits)')}</label>
                  <input id="trn" className={`input ${errors.trn ? 'invalid' : ''}`} dir="ltr" disabled={!c.vatRegistered} value={c.vatRegistered ? c.trn : ''} onChange={setCf('trn')} placeholder="100123456700003" />
                  <label className="checkbox mt-1"><input type="checkbox" checked={!c.vatRegistered} onChange={(e) => setC({ ...c, vatRegistered: !e.target.checked })} /> {t('Not registered for VAT')}</label>
                  {errors.trn && <span className="err">{t(errors.trn)}</span>}
                </div>
                {S({ id: 'emirate', label: 'Emirate', options: reg.emirates })}
                {F({ id: 'street', label: 'Address', obj: 'c' })}
                {F({ id: 'emaraTaxEmail', label: 'Email registered in EmaraTax', obj: 'c', type: 'email', ltr: true })}
                {S({ id: 'sendingMethod', label: 'How will you send invoices?', options: reg.sendingMethods })}
                {S({ id: 'volume', label: 'Expected volume', options: reg.volumes })}
              </div>
              {pkgSuggestion && (
                <div className="alert info mt-2"><Sparkles size={18} /> <span>{t('Suggested package: {name}', { name: t(pkgSuggestion.name) })}{!pkgSuggestion.custom && ` · ${formatMoney(pkgSuggestion.price)} ${t('/mo')}`}</span></div>
              )}
              <div className="flex gap-1 mt-2">
                <button className="btn btn-outline" onClick={() => setStep(0)}><ArrowLeft size={16} className="flip-rtl" /> {t('Back')}</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={next}>{t('Continue')} <ArrowRight size={16} className="flip-rtl" /></button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {[['terms', terms, p.policies.terms], ['disclaimer', disclaimer, p.policies.disclaimer]].map(([k, v, pol]) => (
                <div key={k} className="mb-2">
                  <div className="flex between items-center mb-1"><b>{lang === 'ar' ? pol.titleAr : t(pol.title)}</b><span className="badge gray">{t('Version {v}', { v: v.version })}</span></div>
                  <div className="terms-box">{lang === 'ar' ? v.ar : v.en}</div>
                  <label className="checkbox mt-1"><input type="checkbox" checked={accept[k]} onChange={(e) => setAccept({ ...accept, [k]: e.target.checked })} /> {t('I have read and accept the {doc}, version {v}.', { doc: lang === 'ar' ? pol.titleAr : t(pol.title), v: v.version })}</label>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 13 }}><Building2 size={14} /> {t('We keep a record of the version, the time and who accepted. See also our')} <Link to="/privacy" target="_blank">{t('Privacy Policy')}</Link>.</p>
              <div className="flex gap-1 mt-2">
                <button className="btn btn-outline" onClick={() => setStep(1)}><ArrowLeft size={16} className="flip-rtl" /> {t('Back')}</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? <><Loader2 size={18} className="spin" /> {t('Creating account…')}</> : t('Create account and choose package')}</button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
