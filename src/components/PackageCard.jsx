import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { periodPrice, CURRENCY, billingPeriods, VAT_RATE, PRICES_INCLUDE_VAT } from '../data/packages';
import { useLang } from '../i18n/LanguageContext';

export function PeriodToggle({ months, onChange, dark = false }) {
  const { t } = useLang();
  return (
    <div className={`segmented ${dark ? 'segmented-dark' : ''}`} role="tablist" aria-label={t('Billing period')}>
      {billingPeriods.map((b) => (
        <button key={b.months} type="button" className={months === b.months ? 'on' : ''} onClick={() => onChange(b.months)}>
          {t(b.label)} {b.save && <span className="save" dir="ltr">-{b.save}</span>}
        </button>
      ))}
    </div>
  );
}

export default function PackageCard({ pkg, months = 1, onSelect, label, current }) {
  const { t } = useLang();
  const total = periodPrice(pkg, months);
  const full = pkg.price * months;
  return (
    <div className={`pcard ${pkg.popular ? 'pcard-pop' : ''} ${current ? 'pcard-is-current' : ''}`}>
      <div className="pcard-top">
        <h3>{t(pkg.name)}</h3>
        {current ? <span className="pcard-tag pcard-current">{t('Your plan')}</span>
          : pkg.popular && <span className="pcard-tag"><Sparkles size={13} /> {t('Most popular')}</span>}
      </div>
      <p className="pcard-tagline">{t(pkg.tagline)}</p>

      <div className="pcard-price">
        <span className="cur">{t(CURRENCY)}</span>
        <span className="amt">{total}</span>
        <span className="per">/ {months === 1 ? t('mo') : t('{n} mo', { n: months })}</span>
      </div>
      <div className="pcard-note">
        {months > 1
          ? t(PRICES_INCLUDE_VAT ? 'Save {cur} {amount} · incl. VAT' : VAT_RATE ? 'Save {cur} {amount} · excl. VAT' : 'Save {cur} {amount}', { cur: t(CURRENCY), amount: full - total })
          : t(PRICES_INCLUDE_VAT ? 'Billed monthly · incl. VAT' : VAT_RATE ? 'Billed monthly · excl. VAT' : 'Billed monthly')}
      </div>

      <div className="pcard-chips">
        <span><strong>{(pkg.transactions * months).toLocaleString()}</strong> {t('invoices')}</span>
        <span><strong>{pkg.users}</strong> {t('users')}</span>
      </div>

      <button className={`btn btn-block ${pkg.popular ? 'btn-white' : 'btn-dark'}`} onClick={() => onSelect(pkg)}>
        {label || t('Get {name}', { name: t(pkg.name) })} <ArrowRight size={16} className="flip-rtl" />
      </button>

      <ul className="pcard-list">
        {pkg.features.map((f) => (
          <li key={f}><Check size={15} /> {t(f)}</li>
        ))}
        <li><Check size={15} /> {t(pkg.support)}</li>
      </ul>
    </div>
  );
}
