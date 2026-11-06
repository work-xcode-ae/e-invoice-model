import { useEffect, useRef, useState } from 'react';
import {
  UserPlus, PackageCheck, CreditCard, Building2, FileText, Landmark, Check, Lock, Mail,
  Sparkles, ShieldCheck, Send, Clock, Loader2, BadgeCheck,
} from 'lucide-react';

const DURATION = 5000;

const steps = [
  { icon: UserPlus, color: '#3b82f6', title: 'Create your account', text: 'Sign up with your work email or Google / Microsoft. It takes under a minute.' },
  { icon: PackageCheck, color: '#8b5cf6', title: 'Pick a package', text: 'Basic, Standard or Platinum, based on your monthly invoices and team size.' },
  { icon: CreditCard, color: '#0ea5e9', title: 'Pay with Stripe', text: 'Card, Apple Pay or Google Pay. Your subscription activates instantly.' },
  { icon: Building2, color: '#f59e0b', title: 'Set up your company', text: 'Add trade licence and TRN, then link through EmaraTax to get your Peppol ID.' },
  { icon: FileText, color: '#10b981', title: 'Issue your invoice', text: 'Choose a customer, add items, and VAT and totals are done for you.' },
  { icon: Landmark, color: '#ec4899', title: 'Delivered & reported', text: 'Validated, sent over Peppol to your buyer and reported to the FTA. You watch it live.' },
];

/* ---------- Mini previews (one per step) ---------- */
const Field = ({ label, value, icon: Icon, typing }) => (
  <div className="pv-field">
    <span>{label}</span>
    <div className="pv-input">{Icon && <Icon size={14} />}<b className={typing ? 'typing' : ''}>{value}</b></div>
  </div>
);

function PreviewAccount() {
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 300 }}>
        <div className="pv-title">Create your account</div>
        <Field label="Full name" value="Hazem Naim" />
        <Field label="Work email" value="hazem@abctrading.ae" icon={Mail} typing />
        <Field label="Password" value="••••••••••" icon={Lock} />
        <div className="pv-meter"><i /><i /><i /><i /></div>
        <div className="pv-btn">Create account</div>
      </div>
    </div>
  );
}

function PreviewPackage() {
  const plans = [['Basic', 50, 100], ['Standard', 100, 500], ['Platinum', 200, '1,000']];
  return (
    <div className="pv-plans">
      {plans.map(([n, p, t], i) => (
        <div key={n} className={`pv-plan ${i === 1 ? 'on' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
          {i === 1 && <span className="pv-pop"><Sparkles size={10} /> Popular</span>}
          <small>{n}</small>
          <strong>AED {p}</strong>
          <span>{t} invoices</span>
          <div className="pv-sel">{i === 1 ? <><Check size={12} /> Selected</> : 'Select'}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewPay() {
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 300 }}>
        <div className="pv-row"><span>Standard · 1 month</span><b>AED 100</b></div>
        <div className="pv-row"><span>VAT (5%)</span><b>AED 5</b></div>
        <div className="pv-row total"><span>Total</span><b>AED 105</b></div>
        <div className="pv-stripe">Pay with <b>stripe</b></div>
        <div className="pv-success"><span className="pv-check"><Check size={18} /></span> Payment successful</div>
      </div>
    </div>
  );
}

function PreviewCompany() {
  return (
    <div className="pv-center">
      <div className="pv-card" style={{ width: 320 }}>
        <div className="pv-title">Company details</div>
        <Field label="Company name" value="ABC Trading LLC" />
        <div className="pv-2">
          <Field label="Trade licence" value="1234567" />
          <Field label="TRN" value="100234567800003" />
        </div>
        <div className="pv-linked"><BadgeCheck size={16} /> Linked in EmaraTax · Peppol ID issued</div>
      </div>
    </div>
  );
}

function PreviewInvoice() {
  return (
    <div className="pv-center">
      <div className="pv-card pv-invoice" style={{ width: 340 }}>
        <div className="flex between items-center">
          <div className="pv-title mb-0">Invoice INV-1001</div>
          <span className="pv-chip">Draft</span>
        </div>
        <div className="pv-muted">Customer · Al Noor LLC</div>
        <div className="pv-items">
          {[['Consulting service', 2, 1500], ['Software licence', 1, 800]].map(([n, q, p], i) => (
            <div key={n} className="pv-item" style={{ animationDelay: `${i * 150 + 200}ms` }}>
              <span>{n}</span><span>×{q}</span><b>{(q * p).toLocaleString()}</b>
            </div>
          ))}
        </div>
        <div className="pv-row"><span>VAT 5%</span><b>190</b></div>
        <div className="pv-row total"><span>Total (AED)</span><b>3,990</b></div>
        <div className="pv-btn"><Send size={14} /> Create & send</div>
      </div>
    </div>
  );
}

function PreviewTrack() {
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
          <span className="pv-chip green">Success</span>
        </div>
        <div className="pv-tl">
          {tl.map(([Icon, t, time], i) => (
            <div className="pv-tl-row" key={t} style={{ animationDelay: `${i * 450}ms` }}>
              <span className="pv-tl-dot"><Icon size={13} /></span>
              <div><b>{t}</b><small>{time}</small></div>
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
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // restarts progress animation
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (paused || reduced.current) return undefined;
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % steps.length);
      setTick((x) => x + 1);
    }, DURATION);
    return () => clearTimeout(t);
  }, [active, paused, tick]);

  const go = (i) => { setActive(i); setTick((x) => x + 1); };
  const Preview = previews[active];
  const color = steps[active].color;

  return (
    <section className="hiw" id="how-it-works">
      <div className="container">
        <div className="section-head" style={{ marginBottom: 40 }}>
          <div className="eyebrow">How it works</div>
          <h2>From sign-up to the FTA, <span className="grad-ink">in one flow</span></h2>
          <p>Here is what your first invoice looks like, step by step.</p>
        </div>

        <div className="hiw-grid" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <ol className="hiw-list">
            {steps.map(({ icon: Icon, title, text, color: c }, i) => (
              <li key={title} className={i === active ? 'on' : i < active ? 'done' : ''} style={{ '--c': c }}>
                <button type="button" onClick={() => go(i)}>
                  <span className="hiw-ic">{i < active ? <Check size={18} /> : <Icon size={18} />}</span>
                  <span className="hiw-txt">
                    <small>Step {i + 1}</small>
                    <strong>{title}</strong>
                    <span className="hiw-desc">{text}</span>
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
                <div className="hiw-url"><Lock size={11} /> portal.modelfc.ae/{urls[active]}</div>
              </div>
              <div className="hiw-body" key={active}>
                <Preview />
              </div>
            </div>
            <div className="hiw-caption">
              {paused ? 'Paused' : <><Loader2 size={13} className="spin" /> Playing</>} · Step {active + 1} of {steps.length}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
