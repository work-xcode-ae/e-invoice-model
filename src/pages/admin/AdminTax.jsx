import { useState } from 'react';
import { Percent, Receipt, Building2, Save, Undo2, CheckCircle2, AlertTriangle, History, Info, CalendarClock, X } from 'lucide-react';
import { useLang } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from './Admin';
import { getTax, saveTax, validateTax, getTaxHistory, DEFAULT_TAX, splitVat, getPeriods, periodOn, upcomingPeriods, cancelPeriod, todayStr } from '../../services/tax';
import { packages, addOns, formatMoney } from '../../data/packages';
import { TAX_CATEGORIES } from '../../data/ubl';
import { fmtDateTime, fmtDate } from '../../utils/format';

const RATE_FIELDS = ['registered', 'billingRate', 'pricesIncludeVat', 'standardRate'];
const FIELDS = ['registered', 'billingRate', 'pricesIncludeVat', 'standardRate', 'sellerName', 'sellerTrn', 'sellerAddress'];
const fmtVal = (t, v) => (v === true ? t('Yes') : v === false ? t('No') : typeof v === 'number' ? `${v}%` : v || '—');

/** System admin: VAT charged on our sales and the standard VAT rate used on customers' e-invoices. */
export default function AdminTax() {
  const { t, locale } = useLang();
  useDbVersion();
  const current = getTax();
  const [f, setF] = useState({ ...current, from: todayStr() });
  const [errs, setErrs] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState('');
  const history = getTaxHistory();
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  // Compare rate fields with what will already apply on the chosen start date (it may be a scheduled change).
  const saved = { ...current, ...(f.from ? Object.fromEntries(RATE_FIELDS.map((k) => [k, periodOn(f.from)[k]])) : {}) };
  const changed = FIELDS.filter((k) => String(f[k]) !== String(saved[k]));
  const rateChanged = changed.some((k) => RATE_FIELDS.includes(k));
  const periods = getPeriods();
  const upcoming = upcomingPeriods();
  const isFuture = f.from > todayStr();
  const rate = f.registered ? Number(f.billingRate) || 0 : 0;
  const included = f.registered && f.pricesIncludeVat;

  const submit = () => {
    const e = validateTax(f);
    setErrs(e);
    if (Object.keys(e).length) return;
    if (rateChanged && !confirm) { setConfirm(true); return; }
    const c = saveTax(f);
    setConfirm(false);
    setF({ ...getTax(), from: todayStr() });
    setDone(c.rateChanges.length && c.from > todayStr()
      ? t('Scheduled. The new VAT starts on {date}. Until then the current rate stays in use.', { date: fmtDate(c.from, locale) })
      : t('Saved. {n} change(s) apply to new payments and new invoices.', { n: c.rateChanges.length + c.sellerChanges.length }));
    setTimeout(() => setDone(''), 5000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <PageTitle title="Tax & VAT" sub="VAT on our own sales and the standard VAT rate on customers' e-invoices.">
        <button className="btn btn-outline btn-sm" onClick={() => { setF({ ...DEFAULT_TAX, sellerName: f.sellerName, sellerTrn: f.sellerTrn, sellerAddress: f.sellerAddress, from: f.from }); setConfirm(false); }}><Undo2 size={15} /> {t('UAE defaults (5%)')}</button>
      </PageTitle>

      {done && <div className="alert success mb-2"><CheckCircle2 size={18} /> {done}</div>}
      {upcoming.map((p) => (
        <div key={p.id} className="alert info mb-2" style={{ alignItems: 'center' }}>
          <CalendarClock size={18} />
          <span style={{ flex: 1 }}>{t('Scheduled: from {date}, VAT on our sales is {b}% and the standard rate is {s}%.', { date: fmtDate(p.from, locale), b: p.registered ? p.billingRate : 0, s: p.standardRate })}</span>
          <button className="btn btn-outline btn-sm" onClick={() => cancelPeriod(p.id)}><X size={15} /> {t('Cancel change')}</button>
        </div>
      ))}

      <div className="grid-2e tax-form">
        <div className="card">
          <div className="card-head"><div><h3 className="h-icon"><Receipt size={18} /> {t('VAT on our sales')}</h3><small>{t('Packages, renewals, upgrades and add-ons that customers buy from us.')}</small></div></div>

          <div className="field"><label>{t('We are VAT registered')}</label>
            <div className="seg-choice two">
              <button type="button" className={f.registered ? 'on' : ''} onClick={() => set('registered')(true)}><b>{t('Yes, charge VAT')}</b></button>
              <button type="button" className={!f.registered ? 'on' : ''} onClick={() => set('registered')(false)}><b>{t('No VAT')}</b></button>
            </div></div>

          {f.registered && (
            <>
              <div className="field"><label>{t('VAT rate (%)')}</label>
                <div className="input-suffix"><input className="input" dir="ltr" type="number" min="0" max="100" step="0.01" value={f.billingRate} onChange={set('billingRate')} /><span>%</span></div>
                {errs.billingRate && <span className="field-error">{t(errs.billingRate)}</span>}
              </div>
              <div className="field"><label>{t('Package prices are')}</label>
                <div className="seg-choice two">
                  <button type="button" className={!f.pricesIncludeVat ? 'on' : ''} onClick={() => set('pricesIncludeVat')(false)}><b>{t('Excluding VAT')}</b><small>{t('VAT is added at checkout')}</small></button>
                  <button type="button" className={f.pricesIncludeVat ? 'on' : ''} onClick={() => set('pricesIncludeVat')(true)}><b>{t('Including VAT')}</b><small>{t('The price is what they pay')}</small></button>
                </div></div>
            </>
          )}

          <h4 className="mt-2">{t('What customers pay (1 month)')}</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Package')}</th><th>{t('Price')}</th><th>{t('VAT')}</th><th>{t('Customer pays')}</th></tr></thead>
              <tbody>
                {[...packages.map((p) => ({ key: p.id, name: t(p.name), price: p.price })), ...addOns.map((a) => ({ key: a.id, name: t('Add-on · +{n} transactions', { n: a.transactions }), price: a.price }))].map((r) => {
                  const s = splitVat(r.price, rate, included);
                  return <tr key={r.key}><td>{r.name}</td><td dir="ltr">{formatMoney(r.price)}</td><td dir="ltr">{formatMoney(s.vat)}</td><td dir="ltr"><b>{formatMoney(s.total)}</b></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {included && <p className="muted mt-1 mb-0" style={{ fontSize: 13 }}>{t('With prices including VAT, our revenue without VAT is lower: the VAT is taken out of the price.')}</p>}
        </div>

        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <div className="card">
            <div className="card-head"><div><h3 className="h-icon"><Percent size={18} /> {t("VAT on customers' e-invoices")}</h3><small>{t('Rate of the standard category (S) used when customers create invoices.')}</small></div></div>
            <div className="field"><label>{t('Standard rate (%)')}</label>
              <div className="input-suffix"><input className="input" dir="ltr" type="number" min="0.01" max="100" step="0.01" value={f.standardRate} onChange={set('standardRate')} /><span>%</span></div>
              {errs.standardRate && <span className="field-error">{t(errs.standardRate)}</span>}
              <span className="hint">{t('The UAE standard rate is 5%. Change it only if the law changes.')}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('VAT category')}</th><th>{t('Rate')}</th></tr></thead>
                <tbody>
                  {TAX_CATEGORIES.map((c) => <tr key={c.code}><td><b dir="ltr">{c.code}</b> · {t(c.label, { rate: c.code === 'S' ? f.standardRate : c.rate })}</td><td dir="ltr">{c.code === 'S' ? Number(f.standardRate) || 0 : c.rate}%</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div><h3 className="h-icon"><Building2 size={18} /> {t('Our tax details')}</h3><small>{t('Printed on the tax invoices we issue for subscriptions.')}</small></div></div>
            <div className="field"><label>{t('Legal name *')}</label><input className="input" value={f.sellerName} onChange={set('sellerName')} />{errs.sellerName && <span className="field-error">{t(errs.sellerName)}</span>}</div>
            <div className="field"><label>{t('TRN')}{f.registered ? ' *' : ''}</label><input className="input" dir="ltr" inputMode="numeric" maxLength={15} value={f.sellerTrn} onChange={set('sellerTrn')} />{errs.sellerTrn && <span className="field-error">{t(errs.sellerTrn)}</span>}</div>
            <div className="field"><label>{t('Address')}</label><input className="input" value={f.sellerAddress} onChange={set('sellerAddress')} /></div>
          </div>
        </div>
      </div>

      <div className="card mt-2 save-bar">
        {rateChanged && !confirm && (
          <div className="field mb-0" style={{ margin: 0 }}>
            <label>{t('Start date (effective from)')}</label>
            <input className="input" type="date" dir="ltr" min={todayStr()} value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setConfirm(false); }} />
            {errs.from && <span className="field-error">{t(errs.from)}</span>}
          </div>
        )}
        {confirm ? (
          <div className="alert warn" style={{ flex: 1, margin: 0 }}>
            <AlertTriangle size={18} />
            <div style={{ flex: 1 }}>
              <b>{t('Confirm VAT change')}</b>
              <ul className="mb-0" style={{ paddingInlineStart: 18, margin: '4px 0 0' }}>
                {isFuture && <li><b>{t('Start date')}: {fmtDate(f.from, locale)}</b></li>}
                {changed.map((k) => <li key={k}>{t(LABELS[k])}: {fmtVal(t, saved[k])} → <b>{fmtVal(t, k.includes('Rate') ? Number(f[k]) : f[k])}</b></li>)}
              </ul>
              <small className="muted">{isFuture
                ? t('Starts on {date}. Payments from that day and invoices with an issue date on or after it use the new VAT. Until then nothing changes.', { date: fmtDate(f.from, locale) })
                : t('Applies to new payments and new invoices from now on. Past payments and sent invoices keep their VAT.')}</small>
            </div>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 14, flex: 1 }}>{changed.length ? t('{n} unsaved change(s)', { n: changed.length }) : <><Info size={14} style={{ verticalAlign: '-2px' }} /> {t('Changes apply to new payments and new invoices only.')}</>}</span>
        )}
        <div className="flex gap-1">
          {(changed.length > 0 || confirm) && <button className="btn btn-outline btn-sm" onClick={() => { setF({ ...current, from: todayStr() }); setConfirm(false); setErrs({}); }}>{t('Discard')}</button>}
          <button className="btn btn-primary btn-sm" disabled={!changed.length} onClick={submit}><Save size={15} /> {t(confirm ? (isFuture ? 'Yes, schedule VAT change' : 'Yes, save VAT change') : (rateChanged && isFuture ? 'Schedule' : 'Save'))}</button>
        </div>
      </div>

      <div className="card mt-2">
        <h3 className="h-icon"><CalendarClock size={18} /> {t('VAT rate schedule')}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{t('Each row is a VAT setting and the date it started. Payments use the rate on the payment date; e-invoices use the rate on their issue date.')}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Effective from')}</th><th>{t('Until')}</th><th>{t('VAT on our sales')}</th><th>{t('Prices')}</th><th>{t('Standard rate on e-invoices')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {[...periods].reverse().map((p, i, arr) => {
                const next = arr[i - 1];
                const status = p.from > todayStr() ? 'Upcoming' : p.id === periodOn().id ? 'Current' : 'Ended';
                const until = next ? new Date(new Date(next.from).getTime() - 86400000).toISOString().slice(0, 10) : null;
                return (
                  <tr key={p.id}>
                    <td><b>{fmtDate(p.from, locale)}</b></td>
                    <td className="muted">{until ? fmtDate(until, locale) : '—'}</td>
                    <td dir="ltr">{p.registered ? `${p.billingRate}%` : t('No VAT')}</td>
                    <td>{p.registered ? t(p.pricesIncludeVat ? 'Including VAT' : 'Excluding VAT') : '—'}</td>
                    <td dir="ltr">{p.standardRate}%</td>
                    <td><span className={`badge ${status === 'Current' ? 'green' : status === 'Upcoming' ? 'blue' : 'gray'}`}>{t(status)}</span></td>
                    <td>{status === 'Upcoming' && <button className="link-btn text-danger" onClick={() => cancelPeriod(p.id)}>{t('Cancel change')}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-2">
        <h3 className="h-icon"><History size={18} /> {t('Change history')}</h3>
        {history.length ? (
          <ul className="activity-list">
            {history.map((h, i) => (
              <li key={i}>
                <span className="act-dot t-activity" />
                <div><b>{h.cancelled ? t('Scheduled change for {date} cancelled', { date: fmtDate(h.effective, locale) }) : h.changes.map((c) => `${t(c.field)}: ${fmtVal(t, c.from)} → ${fmtVal(t, c.to)}`).join(' · ')}</b><small>{t(h.by)}{h.effective && !h.cancelled ? ` · ${t('effective {date}', { date: fmtDate(h.effective, locale) })}` : ''}</small></div>
                <time className="muted">{fmtDateTime(h.at, locale)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="muted mb-0">{t('No changes yet. The UAE default of 5% is in use.')}</p>}
      </div>
    </>
  );
}

const LABELS = { registered: 'VAT registered', billingRate: 'VAT on our sales', pricesIncludeVat: 'Prices include VAT', standardRate: 'Standard rate on e-invoices', sellerName: 'Legal name', sellerTrn: 'TRN', sellerAddress: 'Address' };
