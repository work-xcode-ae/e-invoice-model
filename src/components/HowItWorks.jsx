import { useEffect, useRef, useState } from 'react';
import {
  UserPlus, PackageCheck, CreditCard, Building2, FileText, Landmark, Check, Lock, Mail,
  Sparkles, ShieldCheck, Send, Clock, Loader2, BadgeCheck,
} from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';

const DURATION = 5000;

const steps = [
  { icon: UserPlus, color: '#0f5c94', title: 'Create your account', text: 'Sign up with your work email or Google / Microsoft. It takes under a minute.' },
  { icon: PackageCheck, color: '#1a86a6', title: 'Pick a package', text: 'Basic, Standard or Platinum, based on your monthly invoices and team size.' },
  { icon: CreditCard, color: '#b07f3e', title: 'Pay with Stripe', text: 'Card, Apple Pay or Google Pay. Your subscription activates instantly.' },
  { icon: Building2, color: '#092f58', title: 'Set up your company', text: 'Add trade licence and TRN, then link through EmaraTax to get your Peppol ID.' },
  { icon: FileText, color: '#1a86a6', title: 'Issue your invoice', text: 'Choose a customer, add items, and VAT and totals are done for you.' },
  { icon: Landmark, color: '#b07f3e', title: 'Delivered & reported', text: 'Validated, sent over Peppol to your buyer and reported to the FTA. You watch it live.' },
];

/* ---------- Mini previews (one per step) ---------- */
const Field = ({ label, value, icon: Icon, typing }) => {
  const { t } = useLang();
  return (
  <div className="pv-field">
    <span>{t(label)}</span>
    <div className="pv-input" dir="ltr">{Icon && <Icon size={14} />}<b className={typing ? 'typing' : ''}>{value}</b></div>
  </div>
  );
};

function PreviewAccount() {
  const { t } = useLang();
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 300 }}>
        <div className="pv-title">{t('Create your account')}</div>
        <Field label="Full name" value="Hazem Naim" />
        <Field label="Work email" value="hazem@abctrading.ae" icon={Mail} typing />
        <Field label="Password" value="••••••••••" icon={Lock} />
        <div className="pv-meter"><i /><i /><i /><i /></div>
        <div className="pv-btn">{t('Create account')}</div>
      </div>
    </div>
  );
}

function PreviewPackage() {
  const { t } = useLang();
  const plans = [['Basic', 50, 100], ['Standard', 100, 500], ['Platinum', 200, '1,000']];
  return (
    <div className="pv-plans">
      {plans.map(([n, p, tx], i) => (
        <div key={n} className={`pv-plan ${i === 1 ? 'on' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
          {i === 1 && <span className="pv-pop"><Sparkles size={10} /> {t('Popular')}</span>}
          <small>{t(n)}</small>
          <strong>{t('AED')} {p}</strong>
          <span>{tx} {t('invoices')}</span>
          <div className="pv-sel">{i === 1 ? <><Check size={12} /> {t('Selected')}</> : t('Select')}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewPay() {
  const { t } = useLang();
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 300 }}>
        <div className="pv-row"><span>{t('Standard · 1 month')}</span><b>{t('AED')} 100</b></div>
        <div className="pv-row"><span>{t('VAT (5%)')}</span><b>{t('AED')} 5</b></div>
        <div className="pv-row total"><span>{t('Total')}</span><b>{t('AED')} 105</b></div>
        <div className="pv-stripe">{t('Pay with')} <b>stripe</b></div>
        <div className="pv-success"><span className="pv-check"><Check size={18} /></span> {t('Payment successful')}</div>
      </div>
    </div>
  );
}

function PreviewCompany() {
  const { t } = useLang();
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 320 }}>
        <div className="pv-title">{t('Company details')}</div>
        <Field label="Company name" value="ABC Trading LLC" />
        <div className="pv-2">
          <Field label="Trade licence" value="1234567" />
          <Field label="TRN" value="100234567800003" />
        </div>
        <div className="pv-linked"><BadgeCheck size={16} /> {t('Linked in EmaraTax · Peppol ID issued')}</div>
      </div>
    </div>
  );
}

function PreviewInvoice() {
  const { t } = useLang();
  return (
    <div className="pv-center">
      <div className="pv-card pv-invoice" style={{ width: 340 }}>
        <div className="flex between items-center">
          <div className="pv-title mb-0">{t('Invoice')} INV-1001</div>
          <span className="pv-chip">{t('Draft')}</span>
        </div>
        <div className="pv-muted">{t('Customer')} · Al Noor LLC</div>
        <div className="pv-items">
          {[['Consulting service', 2, 1500], ['Software licence', 1, 800]].map(([n, q, p], i) => (
            <div key={n} className="pv-item" style={{ animationDelay: `${i * 150 + 200}ms` }}>
              <span>{t(n)}</span><span>×{q}</span><b>{(q * p).toLocaleString()}</b>
            </div>
          ))}
        </div>
        <div className="pv-row"><span>{t('VAT 5%')}</span><b>190</b></div>
        <div className="pv-row total"><span>{t('Total (AED)')}</span><b>3,990</b></div>
        <div className="pv-btn"><Send size={14} /> {t('Create & send')}</div>
      </div>
    </div>
  );
}

function PreviewTrack() {
  const { t } = useLang();
  const tl = [
    [Clock, 'Queued', '10:25:02'],
    [ShieldCheck, 'Validated · PINT AE', '10:25:03'],
    [Send, 'Sent via Peppol AS4', '10:26:41'],
    [Landmark, 'Reported to FTA', '10:27:05'],
  ];
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 330 }}>
        <div className="flex between items-center">
          <div className="pv-title mb-0">INV-1001</div>
          <span className="pv-chip green">{t('Success')}</span>
        </div>
        <div className="pv-tl">
          {tl.map(([Icon, label, time], i) => (
            <div className="pv-tl-row" key={label} style={{ animationDelay: `${i * 450}ms` }}>
              <span className="pv-tl-dot"><Icon size={13} /></span>
              <div><b>{t(label)}</b><small>{time}</small></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const previews = [PreviewAccount, PreviewPackage, PreviewPay, PreviewCompany, PreviewInvoice, PreviewTrack];
const urls = ['register', 'packages', 'checkout', 'company', 'invoices/new', 'invoices/INV-1001'];

export default function HowItWorks() {
  const { t } = useLang();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // restarts progress animation
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (paused || reduced.current) return undefined;
    const timer = setTimeout(() => {
      setActive((a) => (a + 1) % steps.length);
      setTick((x) => x + 1);
    }, DURATION);
    return () => clearTimeout(timer);
  }, [active, paused, tick]);

  const go = (i) => { setActive(i); setTick((x) => x + 1); };
  const Preview = previews[active];
  const color = steps[active].color;

  return (
    <section className="hiw" id="how-it-works">
      <div className="container">
        <div className="section-head" style={{ marginBottom: 40 }}>
          <div className="eyebrow">{t('How it works')}</div>
          <h2>{t('From sign-up to the FTA,')} <span className="grad-ink">{t('in one flow')}</span></h2>
          <p>{t('Here is what your first invoice looks like, step by step.')}</p>
        </div>

        <div className="hiw-grid" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <ol className="hiw-list">
            {steps.map(({ icon: Icon, title, text, color: c }, i) => (
              <li key={title} className={i === active ? 'on' : i < active ? 'done' : ''} style={{ '--c': c }}>
                <button type="button" onClick={() => go(i)}>
                  <span className="hiw-ic">{i < active ? <Check size={18} /> : <Icon size={18} />}</span>
                  <span className="hiw-txt">
                    <small>{t('Step {n}', { n: i + 1 })}</small>
                    <strong>{t(title)}</strong>
                    <span className="hiw-desc">{t(text)}</span>
                  </span>
                </button>
                {i === active && (
                  <span className="hiw-progress">
                    <i key={tick} style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
                  </span>
                )}
              </li>
            ))}
          </ol>

          <div className="hiw-stage" style={{ '--c': color }}>
            <div className="hiw-window">
              <div className="hiw-bar">
                <span /><span /><span />
                <div className="hiw-url" dir="ltr"><Lock size={11} /> portal.modelfc.ae/{urls[active]}</div>
              </div>
              <div className="hiw-body" key={active}>
                <Preview />
              </div>
            </div>
            <div className="hiw-caption">
              {paused ? t('Paused') : <><Loader2 size={13} className="spin" /> {t('Playing')}</>} · {t('Step {n} of {total}', { n: active + 1, total: steps.length })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
