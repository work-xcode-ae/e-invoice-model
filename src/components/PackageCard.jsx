import { Check, ArrowRight, Sparkles, Building } from 'lucide-react';
import { periodPrice, CURRENCY, billingPeriods, VAT_RATE, PRICES_INCLUDE_VAT, annualSaving, packages, pkgText, formatMoney } from '../data/packages';
import { useLang } from '../i18n/LanguageContext';

export function PeriodToggle({ months, onChange, dark = false }) {
  const { t } = useLang();
  const best = Math.max(0, ...packages.filter((p) => !p.custom && p.price).map(annualSaving));
  return (
    <div className={`segmented ${dark ? 'segmented-dark' : ''}`} role="tablist" aria-label={t('Billing period')}>
      {billingPeriods.map((b) => (
        <button key={b.months} type="button" className={months === b.months ? 'on' : ''} onClick={() => onChange(b.months)}>
          {t(b.label)} {b.months === 12 && best > 0 && <span className="save" dir="ltr">-{best}%</span>}
        </button>
      ))}
    </div>
  );
}

const vatNote = (t, billed) => t(PRICES_INCLUDE_VAT ? `${billed} · incl. VAT` : VAT_RATE ? `${billed} · excl. VAT` : billed);

export default function PackageCard({ pkg, months = 1, onSelect, label, current }) {
  const { t, lang } = useLang();
  const annual = months === 12;
  const total = periodPrice(pkg, months);
  const saving = annual ? Math.max(0, pkg.price * 12 - pkg.annualPrice) : 0;
  const features = pkgText(pkg, 'features', lang, t);
  return (
    <div className={`pcard ${pkg.popular ? 'pcard-pop' : ''} ${current ? 'pcard-is-current' : ''}`}>
      <div className="pcard-top">
        <h3>{t(pkg.name)}</h3>
        {current ? <span className="pcard-tag pcard-current">{t('Your plan')}</span>
          : pkg.popular && <span className="pcard-tag"><Sparkles size={13} /> {t('Most popular')}</span>}
      </div>
      <p className="pcard-tagline">{pkgText(pkg, 'tagline', lang, t)}</p>

      {pkg.custom ? (
        <div className="pcard-price"><span className="amt" style={{ fontSize: 30 }}>{t('Custom')}</span></div>
      ) : (
        <div className="pcard-price">
          <span className="cur">{t(CURRENCY)}</span>
          <span className="amt">{total.toLocaleString('en-US')}</span>
          <span className="per">/ {annual ? t('year') : t('mo')}</span>
        </div>
      )}
      <div className="pcard-note">
        {pkg.custom ? t('Contract and price built for your group')
          : annual ? (saving > 0 ? t(PRICES_INCLUDE_VAT ? 'Save {cur} {amount} · incl. VAT' : VAT_RATE ? 'Save {cur} {amount} · excl. VAT' : 'Save {cur} {amount}', { cur: t(CURRENCY), amount: saving }) : vatNote(t, 'Billed yearly'))
          : vatNote(t, pkg.price ? 'Billed monthly' : 'Free')}
      </div>

      <div className="pcard-chips">
        {pkg.custom ? <span><strong>{t('Custom')}</strong> {t('documents')}</span>
          : <span><strong>{Number(pkg.transactions).toLocaleString()}</strong> {t('docs / month')}</span>}
        <span><strong>{pkg.users}</strong> {t('users')}</span>
        {!pkg.custom && <span><strong dir="ltr">{formatMoney(pkg.overagePrice)}</strong> {t('per extra doc')}</span>}
        {Number(pkg.setupFee) > 0 && <span><strong dir="ltr">{formatMoney(pkg.setupFee)}</strong> {t(pkg.setupFeeType === 'annual' ? 'setup / year' : 'setup once')}</span>}
      </div>

      <button className={`btn btn-block ${pkg.popular ? 'btn-white' : 'btn-dark'}`} onClick={() => onSelect(pkg)}>
        {pkg.custom ? <><Building size={16} /> {t('Request a quote')}</> : <>{label || t('Get {name}', { name: t(pkg.name) })} <ArrowRight size={16} className="flip-rtl" /></>}
      </button>

      <ul className="pcard-list">
        <li><Check size={15} /> {t('100 free documents every subscription year')}</li>
        {features.filter((f) => !/100 free/.test(f)).map((f) => (
          <li key={f}><Check size={15} /> {f}</li>
        ))}
        <li><Check size={15} /> {t(pkg.support)}</li>
      </ul>
    </div>
  );
}
