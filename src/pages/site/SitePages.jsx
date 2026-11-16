// Public website pages (WEB-01..WEB-08): How it works, FAQ, News, Become a partner, Advertise,
// legal pages with versions, the "Are you obligated?" tool and the marketing unsubscribe page.
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Loader2, AlertCircle, Handshake, Users, Wrench, BadgePercent, Send, ArrowRight, MessageCircle,
  FileText, ShieldCheck, Clock, Calendar, Megaphone, Share2, Upload,
} from 'lucide-react';
import PageHero from '../../components/PageHero';
import HowItWorks from '../../components/HowItWorks';
import { VideoSlot, AdSlot } from '../../components/Site';
import { useSeo, usePage } from '../../components/Brd';
import { useLang, errText } from '../../i18n/LanguageContext';
import { getPlatform, localized, currentPolicy } from '../../services/platform';
import { applyAsPartner, captureReferral, partnerByCode } from '../../services/partners';
import { createLead, unsubscribe, getLead } from '../../services/crm';
import { submitAd } from '../../services/ads';
import { packages, formatMoney } from '../../data/packages';
import { STAGES } from '../../services/lifecycle';
import { fmtDate } from '../../utils/format';

/* ====================== How it works ====================== */
export function HowItWorksPage() {
  const { t } = useLang();
  useSeo('howItWorks');
  const page = usePage('howItWorks');
  const steps = [
    ['Choose and pay', 'Pick a package, monthly or annual, and pay by card (or bank transfer for annual). Your tax invoice is emailed at once.'],
    ['Upload documents', 'Trade licence, Emirates ID of the authorised person, VAT certificate if registered and the authorisation letter.'],
    ['Review', 'Our customer service team reviews them within 4 working hours. If something is missing we complete it with you — no rejection.'],
    ['Link through EmaraTax', 'Authorise Model as your provider in EmaraTax. We retrieve and verify your Peppol ID (0235:TIN).'],
    ['Activation', 'Your account is active and your subscription year starts today. Open the billing portal from your dashboard.'],
    ['Issue invoices', 'Issue and receive e-invoices in the approved billing portal. We count the documents you send and show your usage.'],
  ];
  return (
    <>
      <PageHero title={page.title} subtitle={page.subtitle} />
      <section className="section">
        <div className="container">
          <div className="grid grid-3">
            {steps.map(([title, d], i) => (
              <div className="card" key={title}>
                <span className="step-num" style={{ position: 'static', marginBottom: 8, display: 'inline-grid' }}>{i + 1}</span>
                <h3 style={{ fontSize: 18 }}>{t(title)}</h3>
                <p className="mb-0">{t(d)}</p>
              </div>
            ))}
          </div>
          <div className="card mt-3">
            <h3>{t('Your account stages')}</h3>
            <p className="muted">{t('Your dashboard always shows the stage you are in and the next step.')}</p>
            <div className="chip-group">{STAGES.map((s) => <span key={s} className="chip">{t(s)}</span>)}</div>
          </div>
          <div className="mt-3"><VideoSlot /></div>
        </div>
      </section>
      <HowItWorks />
      <section className="section-sm"><div className="container center"><Link to="/packages" className="btn btn-primary btn-lg">{t('See packages')} <ArrowRight size={16} className="flip-rtl" /></Link></div></section>
    </>
  );
}

/* ====================== FAQ ====================== */
export function FaqPage() {
  const { t, lang } = useLang();
  useSeo('faq');
  const page = usePage('faq');
  const faqs = getPlatform().content.faqs;
  return (
    <>
      <PageHero title={page.title} subtitle={page.subtitle} />
      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <div className="faq">
            {faqs.map((f, i) => (
              <details key={i} open={i === 0}>
                <summary>{localized(f, 'q', lang, t)}</summary>
                <p>{localized(f, 'a', lang, t)}</p>
              </details>
            ))}
          </div>
          <p className="center mt-3 muted">{t('Still have a question?')} <Link to="/contact">{t('Contact us')}</Link></p>
        </div>
      </section>
    </>
  );
}

/* ====================== News ====================== */
export function NewsPage() {
  const { t, lang, locale } = useLang();
  useSeo('news');
  const page = usePage('news');
  const { id } = useParams();
  const list = getPlatform().news.filter((n) => n.published).sort((a, b) => b.date.localeCompare(a.date));
  const item = id && list.find((n) => n.id === id);
  return (
    <>
      <PageHero title={item ? localized(item, 'title', lang, t) : page.title} subtitle={item ? fmtDate(item.date, locale) : page.subtitle} crumb={t('News')} />
      <section className="section">
        <div className="container grid" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)', gap: 24 }}>
          <div className="grid" style={{ gap: 16 }}>
            {item ? (
              <article className="card">
                {item.image && <img src={item.image} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12 }} />}
                <p className="legal-text">{localized(item, 'body', lang, t)}</p>
                <Link to="/news">← {t('All news')}</Link>
              </article>
            ) : list.map((n) => (
              <Link key={n.id} to={`/news/${n.id}`} className="card card-hover news-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <time>{fmtDate(n.date, locale)}</time>
                <h3 className="mb-0">{localized(n, 'title', lang, t)}</h3>
                <p className="mb-0">{localized(n, 'body', lang, t).slice(0, 180)}…</p>
              </Link>
            ))}
            {!list.length && <div className="empty-state">{t('No news yet.')}</div>}
          </div>
          <aside className="grid" style={{ gap: 16, alignContent: 'start' }}>
            <AdSlot placement="News sidebar" />
            <div className="card">
              <h4>{t('Are you obligated?')}</h4>
              <p className="muted">{t('See your deadline and the package that fits in one minute.')}</p>
              <Link to="/check" className="btn btn-primary btn-sm">{t('Check now')}</Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

/* ====================== Become a partner (PRT-02) ====================== */
export function PartnerPage() {
  const { t } = useLang();
  useSeo('partner');
  const page = usePage('partner');
  const p = getPlatform();
  const [f, setF] = useState({ company: '', type: p.partnerTypes[0], contactName: '', email: '', phone: '', tradeLicense: '', trn: '', website: '', emirate: '', message: '', password: '', docs: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if ((f.password || '').length < 8) throw Object.assign(new Error(''), { key: 'Choose a password of at least 8 characters for the partner portal.' });
      setDone(await applyAsPartner(f));
    } catch (er) { setErr(er); } finally { setBusy(false); }
  };
  const tpl = p.commissionTemplates;
  return (
    <>
      <PageHero title={page.title} subtitle={page.subtitle} />
      <section className="section">
        <div className="container">
          <div className="grid grid-3">
            {[[Handshake, 'Referral', 'Introduce companies and earn on every subscription they pay.', tpl[0]], [Users, 'Sales agent', 'Sell Model E-Invoice to your clients with a higher commission.', tpl[1]], [Wrench, 'Implementation', 'Connect ERPs and onboard customers; earn on the setup fee too.', tpl[2]]].map(([Icon, title, d, plan]) => (
              <div className="card" key={title}>
                <div className="icon-box"><Icon size={20} /></div>
                <h3 style={{ fontSize: 18 }}>{t(title)}</h3>
                <p>{t(d)}</p>
                {plan && <p className="mb-0"><BadgePercent size={15} style={{ verticalAlign: 'middle' }} /> {t('From {a}% on new subscriptions, {b}% on renewals', { a: plan.newRate, b: plan.renewalRate })}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-2 mt-3" style={{ alignItems: 'start' }}>
            <div className="card">
              <h3>{t('How the programme works')}</h3>
              <ol className="req-list" style={{ paddingInlineStart: 18 }}>
                <li>{t('Apply with your company details and documents.')}</li>
                <li>{t('Our manager reviews the application and assigns your commission plan.')}</li>
                <li>{t('You accept the partnership agreement online, then receive your referral code and link.')}</li>
                <li>{t('Customers who register through your link (valid {n} days) or code are yours. One partner per customer.', { n: p.durations.referralDays })}</li>
                <li>{t('Commission is held until the customer is active and {n} days have passed since payment.', { n: p.durations.commissionHoldDays })}</li>
                <li>{t('You receive a periodic statement. After approval and your invoice, we pay by bank transfer.')}</li>
              </ol>
              <p className="muted mb-0"><Link to="/terms">{t('Partnership agreement')}</Link> · {t('Version {v}', { v: p.policies.partnerAgreement.versions.slice(-1)[0].version })}</p>
            </div>

            <div className="card">
              <h3>{t('Apply now')}</h3>
              {done ? (
                <div className="alert success"><CheckCircle2 size={18} /> {t('Application {id} received. We will email you after the review.', { id: done.id })}</div>
              ) : (
                <form className="form-grid" onSubmit={submit} noValidate>
                  <div className="field"><label>{t('Company name')}</label><input className="input" value={f.company} onChange={set('company')} /></div>
                  <div className="field"><label>{t('Partner type')}</label><select className="input" value={f.type} onChange={set('type')}>{p.partnerTypes.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></div>
                  <div className="field"><label>{t('Contact name')}</label><input className="input" value={f.contactName} onChange={set('contactName')} /></div>
                  <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={f.email} onChange={set('email')} /></div>
                  <div className="field"><label>{t('Mobile')}</label><input className="input" dir="ltr" value={f.phone} onChange={set('phone')} /></div>
                  <div className="field"><label>{t('Emirate')}</label><select className="input" value={f.emirate} onChange={set('emirate')}><option value="">—</option>{p.registration.emirates.map((x) => <option key={x}>{t(x)}</option>)}</select></div>
                  <div className="field"><label>{t('Trade licence number')}</label><input className="input" dir="ltr" value={f.tradeLicense} onChange={set('tradeLicense')} /></div>
                  <div className="field"><label>{t('TRN (optional)')}</label><input className="input" dir="ltr" value={f.trn} onChange={set('trn')} /></div>
                  <div className="field full"><label>{t('Documents (trade licence, company profile)')}</label>
                    <label className="btn btn-outline btn-sm" style={{ width: 'fit-content' }}><Upload size={15} /> {t('Choose files')}<input type="file" multiple hidden onChange={(e) => setF({ ...f, docs: [...e.target.files].map((x) => x.name) })} /></label>
                    {f.docs.length > 0 && <span className="hint">{f.docs.join(', ')}</span>}</div>
                  <div className="field full"><label>{t('Password for the partner portal')}</label><input className="input" type="password" value={f.password} onChange={set('password')} /></div>
                  <div className="field full"><label>{t('Tell us about your clients')}</label><textarea className="input" rows="3" value={f.message} onChange={set('message')} /></div>
                  {err && <div className="alert error full"><AlertCircle size={18} /> {errText(t, err)}</div>}
                  <button className="btn btn-primary full" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {t('Submit application')}</button>
                </form>
              )}
              <p className="muted mt-2 mb-0" style={{ fontSize: 13 }}>{t('Already a partner?')} <Link to="/login">{t('Sign in to the partner portal')}</Link></p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ====================== Advertise with us (WEB-06) ====================== */
export function AdvertisePage() {
  const { t } = useLang();
  const p = getPlatform();
  const [f, setF] = useState({ advertiser: '', contact: '', email: '', phone: '', trn: '', packageId: p.ads.packages[0]?.id, title: '', titleAr: '', link: '', start: '', image: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { setDone(await submitAd(f)); } catch (er) { setErr(er); } finally { setBusy(false); } };
  return (
    <>
      <PageHero title={t('Advertise with us')} subtitle={t('Reach UAE finance teams preparing for e-invoicing.')} />
      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h3>{t('Ad packages')}</h3>
            <div className="table-wrap"><table><thead><tr><th>{t('Package')}</th><th>{t('Placement')}</th><th>{t('Days')}</th><th>{t('Price')}</th></tr></thead>
              <tbody>{p.ads.packages.map((a) => <tr key={a.id}><td>{t(a.name)}</td><td>{t(a.placement)}</td><td>{a.days}</td><td dir="ltr">{formatMoney(a.price)}</td></tr>)}</tbody></table></div>
            <p className="muted mt-2 mb-0">{t('Every ad is reviewed before it goes live. You receive a tax invoice and a views and clicks report.')}</p>
          </div>
          <div className="card">
            <h3>{t('Request an ad')}</h3>
            {done ? <div className="alert success"><CheckCircle2 size={18} /> {t('Request {id} received. We will review it and send your tax invoice.', { id: done.id })}</div> : (
              <form className="form-grid" onSubmit={submit} noValidate>
                <div className="field"><label>{t('Company name')}</label><input className="input" value={f.advertiser} onChange={set('advertiser')} /></div>
                <div className="field"><label>{t('Contact name')}</label><input className="input" value={f.contact} onChange={set('contact')} /></div>
                <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={f.email} onChange={set('email')} /></div>
                <div className="field"><label>{t('TRN (optional)')}</label><input className="input" dir="ltr" value={f.trn} onChange={set('trn')} /></div>
                <div className="field"><label>{t('Ad package')}</label><select className="input" value={f.packageId} onChange={set('packageId')}>{p.ads.packages.map((a) => <option key={a.id} value={a.id}>{t(a.name)}</option>)}</select></div>
                <div className="field"><label>{t('Start date')}</label><input className="input" type="date" dir="ltr" value={f.start} onChange={set('start')} /></div>
                <div className="field full"><label>{t('Headline (English)')}</label><input className="input" value={f.title} onChange={set('title')} /></div>
                <div className="field full"><label>{t('Headline (Arabic)')}</label><input className="input" dir="rtl" value={f.titleAr} onChange={set('titleAr')} /></div>
                <div className="field full"><label>{t('Link')}</label><input className="input" dir="ltr" value={f.link} onChange={set('link')} placeholder="https://" /></div>
                {err && <div className="alert error full"><AlertCircle size={18} /> {errText(t, err)}</div>}
                <button className="btn btn-primary full" disabled={busy}><Megaphone size={16} /> {t('Send request')}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/* ====================== Legal pages with versions (WEB-01, REG-04) ====================== */
const LEGAL = { terms: 'terms', privacy: 'privacy', 'refund-policy': 'refund', disclaimer: 'disclaimer', 'partner-agreement': 'partnerAgreement' };
export function LegalPage({ slug }) {
  const { t, lang, locale } = useLang();
  const key = LEGAL[slug];
  const pol = getPlatform().policies[key];
  const [ver, setVer] = useState(null);
  const cur = currentPolicy(key);
  const v = (ver && pol.versions.find((x) => x.version === ver)) || cur;
  return (
    <>
      <PageHero title={lang === 'ar' ? pol.titleAr : t(pol.title)} subtitle={t('Version {v} · in force from {date}', { v: v.version, date: fmtDate(v.effectiveDate, locale) })} />
      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <div className="card"><div className="legal-text">{lang === 'ar' ? v.ar : v.en}</div></div>
          {pol.versions.length > 1 && (
            <div className="mt-2 flex gap-1 wrap items-center"><span className="muted">{t('Other versions:')}</span>{pol.versions.map((x) => <button key={x.version} className={`chip ${x.version === v.version ? 'on' : ''}`} onClick={() => setVer(x.version)}>v{x.version} · {fmtDate(x.effectiveDate, locale)}</button>)}</div>
          )}
        </div>
      </section>
    </>
  );
}

/* ====================== "Are you obligated?" (WEB-08) ====================== */
const REVENUE = [['lt3', 'Below AED 375,000 (not VAT registered)', 0], ['lt50', 'AED 375,000 – 50 million', 1000000], ['gte50', 'AED 50 million or more', 50000000], ['gov', 'Government entity', null]];

export function ObligationTool() {
  const { t, lang, locale } = useLang();
  useSeo('check');
  const page = usePage('check');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ob = getPlatform().obligation;
  const refCode = params.get('ref');
  const sentBy = params.get('by') || (refCode ? partnerByCode(refCode)?.name : null);
  useMemo(() => { if (refCode) captureReferral(refCode); }, [refCode]);
  const [a, setA] = useState({ revenue: '', b2b: '', volume: '', name: '', company: '', email: '', phone: '' });
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });
  const ready = a.revenue && a.b2b && a.volume;

  const run = (e) => {
    e.preventDefault();
    const rev = REVENUE.find((r) => r[0] === a.revenue);
    const obligated = a.revenue !== 'lt3' && (a.b2b === 'yes' || a.revenue === 'gov');
    const phase = a.revenue === 'gov' ? ob.phases.find((p) => p.id === 'gov') : a.revenue === 'gte50' ? ob.phases.find((p) => p.id === 'large') : ob.phases.find((p) => p.id === 'other');
    const monthly = Number(a.volume);
    const pkg = monthly > 500 ? packages.find((p) => p.id === 'enterprise') : monthly <= 8 ? packages.find((p) => p.id === 'freemium') : packages.filter((p) => !p.custom && p.active !== false).find((p) => Number(p.transactions) >= monthly) || packages.find((p) => p.id === 'premium');
    const res = { obligated, phase, pkg, rev };
    setResult(res);
    if (a.email || a.phone) {
      createLead({ name: a.name || a.company, company: a.company, email: a.email, phone: a.phone, source: 'Obligation tool', package: pkg?.name, sentBy, partnerId: refCode ? partnerByCode(refCode)?.id : null, tool: { revenue: rev?.[1], b2b: a.b2b, monthly, obligated, goLive: phase?.goLive, package: pkg?.name } });
    }
  };
  const regLink = result ? `/register?package=${result.pkg?.id}&company=${encodeURIComponent(a.company)}&email=${encodeURIComponent(a.email)}&name=${encodeURIComponent(a.name)}${refCode ? `&ref=${refCode}` : ''}` : '';
  const shareUrl = `${window.location.origin}/check?${refCode ? `ref=${refCode}&` : ''}by=${encodeURIComponent(a.name || sentBy || '')}`;

  return (
    <>
      <PageHero title={page.title} subtitle={page.subtitle} />
      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <form className="card" onSubmit={run}>
            {sentBy && <div className="alert info mb-2"><Share2 size={16} /> {t('Shared with you by {name}', { name: sentBy })}</div>}
            <div className="field"><label>{t('Annual revenue')}</label><select className="input" value={a.revenue} onChange={set('revenue')}><option value="">—</option>{REVENUE.map(([id, l]) => <option key={id} value={id}>{t(l)}</option>)}</select></div>
            <div className="field mt-2"><label>{t('Do you invoice other businesses or the government (B2B / B2G)?')}</label>
              <div className="flex gap-1">{['yes', 'no'].map((v) => <label key={v} className={`option-row ${a.b2b === v ? 'on' : ''}`} style={{ flex: 1 }}><span className="flex items-center gap-1"><input type="radio" checked={a.b2b === v} onChange={() => setA({ ...a, b2b: v })} /> {t(v === 'yes' ? 'Yes' : 'No')}</span></label>)}</div></div>
            <div className="field mt-2"><label>{t('Invoices and credit notes you send per month')}</label><input className="input" type="number" min="0" dir="ltr" value={a.volume} onChange={set('volume')} placeholder="120" /></div>
            <h4 className="mt-3">{t('Get the result by email (optional)')}</h4>
            <div className="form-grid">
              <div className="field"><label>{t('Name')}</label><input className="input" value={a.name} onChange={set('name')} /></div>
              <div className="field"><label>{t('Company')}</label><input className="input" value={a.company} onChange={set('company')} /></div>
              <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={a.email} onChange={set('email')} /></div>
              <div className="field"><label>{t('Mobile')}</label><input className="input" dir="ltr" value={a.phone} onChange={set('phone')} /></div>
            </div>
            <button className="btn btn-primary btn-block mt-2" disabled={!ready}>{t('Check my obligation')}</button>
          </form>

          <div className="grid" style={{ gap: 16 }}>
            {result ? (
              <div className={`tool-result ${result.obligated ? 'yes' : 'no'}`}>
                <h3 className="mb-0">{t(result.obligated ? 'Yes, you are likely obligated.' : 'You are likely not obligated yet.')}</h3>
                {result.obligated && result.phase && (
                  <>
                    <p className="mb-0">{localized(result.phase, 'label', lang, t)}</p>
                    <div className="kv-grid">
                      <div><span>{t('Appoint a provider by')}</span><b><Calendar size={14} /> {fmtDate(result.phase.appointBy, locale)}</b></div>
                      <div><span>{t('E-invoicing starts')}</span><b><Clock size={14} /> {fmtDate(result.phase.goLive, locale)}</b></div>
                    </div>
                  </>
                )}
                {result.pkg && <p className="mb-0"><b>{t('Suggested package:')}</b> {t(result.pkg.name)}{!result.pkg.custom && ` · ${formatMoney(result.pkg.price)} ${t('/mo')}`}</p>}
                <div className="flex gap-1 wrap">
                  {result.pkg?.custom ? <Link to="/contact?enterprise=1" className="btn btn-primary">{t('Request an Enterprise quote')}</Link>
                    : <button className="btn btn-primary" onClick={() => navigate(regLink)}>{t('Subscribe and pay')} <ArrowRight size={16} className="flip-rtl" /></button>}
                  <a className="btn btn-success" href={`https://wa.me/?text=${encodeURIComponent(`${t('Check if your company must e-invoice:')} ${shareUrl}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {t('Send via WhatsApp')}</a>
                </div>
              </div>
            ) : (
              <div className="card"><ShieldCheck size={22} color="#1a86a6" /><h3 className="mt-1">{t('What you will see')}</h3><ul className="req-list"><li><CheckCircle2 size={16} /> {t('Whether e-invoicing applies to you')}</li><li><CheckCircle2 size={16} /> {t('Your deadline to appoint a provider and to go live')}</li><li><CheckCircle2 size={16} /> {t('The penalties for missing it')}</li><li><CheckCircle2 size={16} /> {t('The package that fits your volume, with a link to subscribe')}</li></ul></div>
            )}
            <div className="card">
              <h3>{t('Penalties')}</h3>
              <div className="table-wrap"><table><tbody>{ob.penalties.map((p) => <tr key={p.en}><td>{lang === 'ar' ? p.ar : p.en}</td><td dir="ltr"><b>{p.amount}</b></td></tr>)}</tbody></table></div>
              <p className="muted mt-1 mb-0" style={{ fontSize: 12 }}><FileText size={12} /> {localized(ob, 'source', lang, t)}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ====================== Unsubscribe (CRM-06) ====================== */
export function UnsubscribePage() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const id = params.get('l');
  const [done, setDone] = useState(false);
  const lead = id && getLead(id);
  return (
    <section className="section"><div className="container center" style={{ maxWidth: 560 }}>
      <div className="card" style={{ padding: 32 }}>
        {!lead ? <p>{t('This link is not valid.')}</p> : done || lead.unsubscribed ? (
          <><CheckCircle2 size={36} color="#16a34a" /><h2 className="mt-1">{t('You are unsubscribed')}</h2><p className="muted">{t('You will not receive marketing messages from Model E-Invoice any more.')}</p></>
        ) : (
          <><h2>{t('Unsubscribe from marketing messages?')}</h2><p className="muted" dir="ltr">{lead.email}</p><button className="btn btn-primary" onClick={() => { unsubscribe(id); setDone(true); }}>{t('Unsubscribe')}</button></>
        )}
      </div>
    </div></section>
  );
}
