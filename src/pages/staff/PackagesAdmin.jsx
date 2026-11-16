// Packages from the settings (BIL-01..BIL-03, SET-02): every field, bilingual marketing text, new packages
// without code, the annual price capped at 12 × monthly, price changes on a future date.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Plus, Undo2, CheckCircle2, CalendarClock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { packages, LINK_METHODS, formatMoney } from '../../data/packages';
import { savePackage, resetPackages } from '../../services/admin';
import { getUsers } from '../../services/api';

const BLANK = { id: '', name: '', tagline: '', taglineAr: '', price: 0, annualPrice: 0, transactions: 0, overagePrice: 1, setupFee: 0, setupFeeType: 'annual', users: 2, entities: 1, linkMethods: ['Billing portal (web)'], support: 'Standard support', consultingHours: 0, consultingDiscount: 0, features: [], featuresAr: [], active: true };

export function AdminPackagesBrd() {
  const { t, locale } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const edit = staffLevel('packages') === 'full';
  const [sel, setSel] = useState(packages[1]?.id || packages[0].id);
  const [d, setD] = useState(() => ({ ...(packages.find((p) => p.id === sel) || BLANK) }));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const subs = getUsers().filter((u) => u.subscription && u.subscription.packageId === sel && ['Active', 'Past due'].includes(u.subscription.status)).length;
  const pick = (id) => { setSel(id); setD({ ...(packages.find((p) => p.id === id)) }); setErr(''); setOk(''); setConfirm(false); };
  const set = (k, v) => { setOk(''); setD({ ...d, [k]: v }); };
  const save = () => {
    try {
      setErr('');
      const res = savePackage(d.id ? d : { ...d, id: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, { effectiveDate: date });
      setOk(res === 'scheduled' ? 'scheduled' : 'saved'); setConfirm(false);
      if (!d.id) pick(d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    } catch (e) { setErr(e); setConfirm(false); }
  };
  const over12 = !d.custom && Number(d.annualPrice) > Number(d.price) * 12;
  const N = (k, l) => <div className="field"><label>{t(l)}</label><input className="input" type="number" dir="ltr" disabled={!edit} value={d[k]} onChange={(e) => set(k, e.target.value)} /></div>;
  return (
    <>
      <PageTitle title="Packages" sub="Every package value is set here and appears on the pricing page without any code change.">
        {edit && <div className="flex gap-1"><button className="btn btn-outline btn-sm" onClick={() => { setSel(''); setD({ ...BLANK }); }}><Plus size={15} /> {t('New package')}</button><button className="btn btn-outline btn-sm" onClick={() => { resetPackages(); pick(packages[1].id); }}><Undo2 size={15} /> {t('Reset to defaults')}</button><Link to="/admin/billing?tab=offers" className="btn btn-outline btn-sm">{t('Offers and discounts')} →</Link></div>}
      </PageTitle>
      <div className="chip-group mb-2">{packages.map((p) => <button key={p.id} className={`chip ${p.id === sel ? 'on' : ''}`} onClick={() => pick(p.id)}>{t(p.name)}{p.active === false ? ` · ${t('hidden')}` : ''}</button>)}</div>
      <div className="card">
        {err && <div className="alert error mb-2">{errText(t, err)}</div>}
        {ok && <div className="alert success mb-2"><CheckCircle2 size={16} /> {t(ok === 'scheduled' ? 'Scheduled. The new values apply from {date}.' : 'Saved. The pricing page shows it now.', { date })}</div>}
        <div className="form-grid">
          <div className="field"><label>{t('Name')}</label><input className="input" disabled={!edit} value={d.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label>{t('Available for sale')}</label><select className="input" disabled={!edit} value={d.active === false ? 'no' : 'yes'} onChange={(e) => set('active', e.target.value === 'yes')}><option value="yes">{t('Yes')}</option><option value="no">{t('No')}</option></select></div>
          {N('price', 'Monthly price (AED)')}{N('annualPrice', 'Annual price (AED)')}
          {N('transactions', 'Documents per month')}{N('overagePrice', 'Price per extra document (AED)')}
          {N('setupFee', 'Setup fee (AED)')}
          <div className="field"><label>{t('Setup fee type')}</label><select className="input" disabled={!edit} value={d.setupFeeType} onChange={(e) => set('setupFeeType', e.target.value)}><option value="annual">{t('Every subscription year')}</option><option value="one-time">{t('One time')}</option><option value="none">{t('None')}</option></select></div>
          {N('users', 'Users')}{N('entities', 'Entities')}
          {N('consultingHours', 'Consulting hours per year')}{N('consultingDiscount', 'Consulting discount %')}
          <div className="field"><label>{t('Support')}</label><input className="input" disabled={!edit} value={d.support} onChange={(e) => set('support', e.target.value)} /></div>
          <div className="field full"><label>{t('Linking methods')}</label><div className="chip-group">{LINK_METHODS.map((m) => <button type="button" key={m} disabled={!edit} className={`chip ${(d.linkMethods || []).includes(m) ? 'on' : ''}`} onClick={() => set('linkMethods', (d.linkMethods || []).includes(m) ? d.linkMethods.filter((x) => x !== m) : [...(d.linkMethods || []), m])}>{t(m)}</button>)}</div></div>
          <div className="field full"><label>{t('Marketing text (English)')}</label><input className="input" disabled={!edit} value={d.tagline} onChange={(e) => set('tagline', e.target.value)} /></div>
          <div className="field full"><label>{t('Marketing text (Arabic)')}</label><input className="input" dir="rtl" disabled={!edit} value={d.taglineAr || ''} onChange={(e) => set('taglineAr', e.target.value)} /></div>
          <div className="field"><label>{t('Features (English), one per line')}</label><textarea className="input" rows="5" disabled={!edit} value={(d.features || []).join('\n')} onChange={(e) => set('features', e.target.value.split('\n').filter(Boolean))} /></div>
          <div className="field"><label>{t('Features (Arabic), one per line')}</label><textarea className="input" dir="rtl" rows="5" disabled={!edit} value={(d.featuresAr || []).join('\n')} onChange={(e) => set('featuresAr', e.target.value.split('\n').filter(Boolean))} /></div>
        </div>
        {over12 && <div className="alert error mt-2"><AlertTriangle size={16} /> {t('The annual price cannot be more than 12 × the monthly price ({max}).', { max: formatMoney(Number(d.price) * 12) })}</div>}
        {edit && (!confirm ? (
          <div className="flex gap-1 items-center wrap mt-2">
            <label className="flex items-center gap-1"><CalendarClock size={15} /> {t('Starts on')} <input className="input input-sm" type="date" dir="ltr" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <button className="btn btn-primary" disabled={over12} onClick={() => setConfirm(true)}><Save size={15} /> {t('Save')}</button>
          </div>
        ) : (
          <div className="alert warn mt-2" style={{ alignItems: 'center' }}><AlertTriangle size={16} /><span style={{ flex: 1 }}>{t('{n} active subscriber(s) on this package. New prices apply to new purchases and renewals from {date}. Confirm?', { n: subs, date: new Date(date).toLocaleDateString(locale) })}</span><button className="btn btn-primary btn-sm" onClick={save}>{t('Confirm')}</button><button className="btn btn-outline btn-sm" onClick={() => setConfirm(false)}>{t('Cancel')}</button></div>
        ))}
      </div>
    </>
  );
}

