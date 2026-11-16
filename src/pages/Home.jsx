import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, FileSpreadsheet, Code2, PenLine, Send, Landmark, Inbox, ShieldAlert,
  Repeat, Lock, PackagePlus, RefreshCcw, ArrowUpCircle, FileText, CheckCircle2, Activity, Globe2,
} from 'lucide-react';
import PackageCard, { PeriodToggle } from '../components/PackageCard';
import { packages, activePackages } from '../data/packages';
import { useAuth } from '../context/AuthContext';
import { choosePackage, planAction, actionLabel } from '../data/planActions';
import HowItWorks from '../components/HowItWorks';
import StatsBand from '../components/StatsBand';
import { useLang } from '../i18n/LanguageContext';
import { useSeo } from '../components/Brd';
import { VideoSlot, AdSlot } from '../components/Site';
import { getPlatform, localized } from '../services/platform';
import { annualSaving, formatMoney } from '../data/packages';

const pipeline = [
  { icon: Inbox, label: 'Ingest' },
  { icon: ShieldCheck, label: 'Validate' },
  { icon: ShieldAlert, label: 'Usage count' },
  { icon: Repeat, label: 'Queue & retry' },
  { icon: Send, label: 'Peppol AS4' },
  { icon: Landmark, label: 'FTA report' },
];


export default function Home() {
  const navigate = useNavigate();
  const { setCart, user } = useAuth();
  const [months, setMonths] = useState(1);
  const { t } = useLang();

  const { lang } = useLang();
  useSeo('home');
  const cms = getPlatform().content;
  const home = cms.pages.home;
  const faqs = cms.faqs.map((f) => ({ q: localized(f, 'q', lang, t), a: localized(f, 'a', lang, t) }));
  const customHero = lang === 'ar' ? !!home.titleAr : home.titleEn !== 'UAE e-invoicing, compliant from day one.';
  const best = Math.max(0, ...packages.filter((p) => !p.custom && p.price).map(annualSaving));
  const minOver = Math.min(...packages.filter((p) => !p.custom).map((p) => Number(p.overagePrice) || 99));
  const choose = (pkg) => (pkg.custom ? navigate('/contact?enterprise=1') : choosePackage({ user, pkg, months, setCart, navigate }));

  return (
    <>
      {/* HERO — compact & centered so packages are visible on first screen */}
      <section className="hero2">
        <div className="hero2-glow" aria-hidden="true" />
        <div className="container hero2-inner">
          <div className="pill"><span className="dot-live" /> {t('Peppol PINT AE · FTA Tax Data reporting')}</div>
          {customHero
            ? <h1>{localized(home, 'title', lang, t)}</h1>
            : <h1>{t('UAE e-invoicing,')}<br /><span className="grad">{t('compliant from day one.')}</span></h1>}
          <p>{localized(home, 'subtitle', lang, t)}</p>
          <div className="pill mt-1" style={{ background: 'rgba(201,155,91,.18)' }}>{localized(cms, 'accreditedLabel', lang, t)}</div>
          <div className="hero2-cta">
            <PeriodToggle months={months} onChange={setMonths} dark />
          </div>
        </div>
      </section>

      {/* PACKAGES — overlap the hero */}
      <section className="pricing-overlap" id="packages">
        <div className="container">
          <div className="pgrid pgrid-5">
            {activePackages().map((p) => <PackageCard key={p.id} pkg={p} months={months} onSelect={choose}
                label={actionLabel(planAction(user?.subscription, p), p, t)} current={user?.subscription?.packageId === p.id} />)}
          </div>
          <div className="extras">
            <span className="xchip" style={{ '--c': '#1a86a6' }}><i><PackagePlus size={14} /></i> {t('{n} free documents', { n: cms ? getPlatform().durations.freeDocs : 100 })} <b>{t('every year')}</b></span>
            <span className="xchip" style={{ '--c': '#0f5c94' }}><i><RefreshCcw size={14} /></i> {t('Pay annually,')} <b>{t('save up to {n}%', { n: best })}</b></span>
            <span className="xchip" style={{ '--c': '#16a34a' }}><i><FileText size={14} /></i> {t('Extra documents from')} <b dir="ltr">{formatMoney(minOver)}</b></span>
            <span className="xchip" style={{ '--c': '#b07f3e' }}><i><ArrowUpCircle size={14} /></i> {t('Upgrade')} <b>{t('anytime')}</b></span>
            <Link to="/packages" className="xlink">{t('Compare all features')} <ArrowRight size={14} className="flip-rtl" /></Link>
          </div>
        </div>
      </section>

      <StatsBand />

      <section className="section-sm">
        <div className="container grid grid-2" style={{ alignItems: 'center', gap: 32 }}>
          <div>
            <div className="eyebrow">{t('Customer journey')}</div>
            <h2>{t('From subscription to your first e-invoice')}</h2>
            <p>{t('Pay, upload your documents, link Model through EmaraTax and we retrieve your Peppol ID. Your subscription year starts on activation.')}</p>
            <div className="flex gap-1 wrap mt-2">
              <Link to="/check" className="btn btn-primary">{t('Are you obligated? Check now')}</Link>
              <Link to="/how-it-works" className="btn btn-outline">{t('How it works')}</Link>
            </div>
            <div className="mt-2"><AdSlot placement="Home banner" /></div>
          </div>
          <VideoSlot />
        </div>
      </section>

      {/* BENTO FEATURES */}
      <section className="section" id="integrations">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">{t('Platform')}</div>
            <h2>{t('Everything you need to invoice compliantly')}</h2>
          </div>

          <div className="bento">
            {/* Dashboard preview */}
            <div className="tile tile-dark b-dash">
              <div className="tile-label"><Activity size={15} /> {t('Live dashboard')}</div>
              <h3>{t('Track every invoice from queue to FTA.')}</h3>
              <div className="mini-dash">
                <div className="mini-stats">
                  <div><span>{t('Sent today')}</span><strong>1,250</strong></div>
                  <div><span>{t('In queue')}</span><strong>15</strong></div>
                  <div><span>{t('Success')}</span><strong>96%</strong></div>
                </div>
                <div className="mini-usage">
                  <div className="flex between"><span>{t('Transactions')}</span><span dir="ltr">450 / 500</span></div>
                  <div className="bar"><div style={{ width: '90%' }} /></div>
                </div>
                {[
                  ['INV-1001', 'Sent', 'green'],
                  ['INV-1002', 'Processing', 'blue'],
                  ['INV-1003', 'Queued', 'orange'],
                ].map(([id, st, c]) => (
                  <div className="mini-row" key={id}><span>{id}</span><span className={`badge ${c}`}>{t(st)}</span></div>
                ))}
              </div>
            </div>

            <div className="tile b-manual">
              <div className="icon-box"><PenLine size={20} /></div>
              <h3>{t('Manual entry')}</h3>
              <p>{t('Pick a customer, add items, and VAT & totals are calculated.')}</p>
            </div>

            <div className="tile b-excel">
              <div className="icon-box green"><FileSpreadsheet size={20} /></div>
              <h3>{t('Excel upload')}</h3>
              <p>{t('Bulk-upload from our .xlsx template. Errors are flagged per row.')}</p>
            </div>

            <div className="tile b-api">
              <div className="icon-box purple"><Code2 size={20} /></div>
              <h3>{t('REST API & SDK')}</h3>
              <pre className="code" dir="ltr">{`POST /api/invoices
{ "customer": "C-102",
  "items": [ ... ] }`}</pre>
              <div className="sdk"><span>.NET</span><span>Java</span><span>Python</span><span>PHP</span></div>
            </div>

            <div className="tile b-sec">
              <div className="icon-box orange"><Lock size={20} /></div>
              <h3>{t('Secure by design')}</h3>
              <p>{t('MFA, TLS 1.2+, AES-256 at rest, 24/7 monitoring.')}</p>
            </div>

            <div className="tile b-pipe" id="compliance">
              <div className="flex between items-center wrap gap-1">
                <div>
                  <h3 className="mb-0">{t('Validated, delivered and reported automatically')}</h3>
                  <p>{t('UAE 5-corner model: Peppol to your buyer’s provider, Tax Data to the FTA.')}</p>
                </div>
                <span className="badge green"><Globe2 size={13} /> Peppol Seat PAE001264</span>
              </div>
              <div className="flow">
                {pipeline.map(({ icon: Icon, label }, i) => (
                  <div className="flow-step" key={label}>
                    <span className="flow-ic"><Icon size={18} /></span>
                    <span>{t(label)}</span>
                    {i < pipeline.length - 1 && <span className="flow-line" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="container">
          <div className="section-head" style={{ marginBottom: 32 }}>
            <div className="eyebrow">{t('FAQ')}</div>
            <h2>{t('Questions, answered')}</h2>
          </div>
          <div className="faq faq-2">
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{t(f.q)}</summary>
                <p>{t(f.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-sm" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta">
            <div>
              <h2>{t('Ready to send your first e-invoice?')}</h2>
              <p className="flex items-center gap-1"><CheckCircle2 size={16} /> {t('Monthly or annual · upgrade anytime · turn off auto-renewal anytime')}</p>
            </div>
            <div className="flex gap-1 wrap">
              <Link to="/register" className="btn btn-lg btn-gold">{t('Create account')}</Link>
              <Link to="/contact" className="btn btn-ghost-light btn-lg">{t('Talk to sales')}</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
