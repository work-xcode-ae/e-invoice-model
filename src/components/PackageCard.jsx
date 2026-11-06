import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { periodPrice, CURRENCY, billingPeriods } from '../data/packages';

export function PeriodToggle({ months, onChange, dark = false }) {
  return (
    <div className={`segmented ${dark ? 'segmented-dark' : ''}`} role="tablist" aria-label="Billing period">
      {billingPeriods.map((b) => (
        <button key={b.months} type="button" className={months === b.months ? 'on' : ''} onClick={() => onChange(b.months)}>
          {b.label} {b.save && <span className="save">-{b.save}</span>}
        </button>
      ))}
    </div>
  );
}

export default function PackageCard({ pkg, months = 1, onSelect, label, current }) {
  const total = periodPrice(pkg, months);
  const full = pkg.price * months;
  return (
    <div className={`pcard ${pkg.popular ? 'pcard-pop' : ''} ${current ? 'pcard-is-current' : ''}`}>
      <div className="pcard-top">
        <h3>{pkg.name}</h3>
        {current ? <span className="pcard-tag pcard-current">Your plan</span>
          : pkg.popular && <span className="pcard-tag"><Sparkles size={13} /> Most popular</span>}
      </div>
      <p className="pcard-tagline">{pkg.tagline}</p>

      <div className="pcard-price">
        <span className="cur">{CURRENCY}</span>
        <span className="amt">{total}</span>
        <span className="per">/ {months === 1 ? 'mo' : `${months} mo`}</span>
      </div>
      <div className="pcard-note">
        {months > 1 ? <>Save {CURRENCY} {full - total} · excl. VAT</> : 'Billed monthly · excl. VAT'}
      </div>

      <div className="pcard-chips">
        <span><strong>{(pkg.transactions * months).toLocaleString()}</strong> invoices</span>
        <span><strong>{pkg.users}</strong> users</span>
      </div>

      <button className={`btn btn-block ${pkg.popular ? 'btn-white' : 'btn-dark'}`} onClick={() => onSelect(pkg)}>
        {label || `Get ${pkg.name}`} <ArrowRight size={16} />
      </button>

      <ul className="pcard-list">
        {pkg.features.map((f) => (
          <li key={f}><Check size={15} /> {f}</li>
        ))}
        <li><Check size={15} /> {pkg.support}</li>
      </ul>
    </div>
  );
}
