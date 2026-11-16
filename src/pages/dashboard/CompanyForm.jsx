import { useState } from 'react';
import { CheckCircle2, Loader2, Building2, MapPin, Landmark, Mail, Info } from 'lucide-react';
import { useLang } from '../../i18n/LanguageContext';
import { saveCompany } from '../../services/api';
import { sellerProblems } from '../../services/qvalia';
import { COUNTRIES, EMIRATES } from '../../data/ubl';
import { getPlatform } from '../../services/platform';

const blank = {
  name: '', legalName: '', tradeLicense: '', trn: '', peppolId: '', tin: '', vatRegistered: true, licenceIssuer: '', licenceExpiry: '', activity: '', emaraTaxEmail: '',
  street: '', additionalStreet: '', city: '', postalZone: '', emirate: 'Dubai', country: 'AE',
  email: '', phone: '', iban: '', bic: '', bankAccountName: '',
};

/** Seller details. Everything here goes into the AccountingSupplierParty of every e-invoice. */
export default function CompanyForm({ user, onSaved }) {
  const { t } = useLang();
  const [f, setF] = useState(() => ({ ...blank, ...(user.company || {}), street: user.company?.street || user.company?.address || '' }));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => { setOk(false); setF({ ...f, [k]: e.target.value }); };
  const missing = sellerProblems(f);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = 'Required';
    if (!f.tradeLicense.trim()) er.tradeLicense = 'Required';
    if (f.vatRegistered !== false && !/^\d{15}$/.test(f.trn)) er.trn = 'TRN must be 15 digits';
    if (f.tin && !/^\d{10}$/.test(f.tin)) er.tin = 'TIN must be 10 digits.';
    if (f.licenceExpiry && f.licenceExpiry <= new Date().toISOString().slice(0, 10)) er.licenceExpiry = 'The licence has expired. Renew it first.';
    if (f.iban && !/^AE\d{21}$/.test(f.iban.replace(/\s/g, ''))) er.iban = 'UAE IBAN: AE + 21 digits';
    setErr(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    const u = await saveCompany(user.id, { ...f, iban: f.iban.replace(/\s/g, ''), address: f.street });
    setSaving(false); setOk(true);
    onSaved(u);
  };

  const Field = ({ k, label, full, ltr, hint, ...rest }) => (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{t(label)}</label>
      <input className={`input ${err[k] ? 'invalid' : ''}`} dir={ltr ? 'ltr' : undefined} value={f[k]} onChange={set(k)} {...rest} />
      {err[k] ? <span className="err">{t(err[k])}</span> : hint && <span className="hint">{t(hint)}</span>}
    </div>
  );

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="flex between items-center wrap gap-1">
        <h3 className="mb-0">{t('Company details')}</h3>
        <span className={`ready-pill ${missing.length ? 'warn' : 'ok'}`}>
          {missing.length ? <><Info size={14} /> {t('Complete these to send e-invoices')}</> : <><CheckCircle2 size={14} /> {t('Ready for e-invoicing')}</>}
        </span>
      </div>
      <p className="mb-2 muted">{t('Shown as the seller on every e-invoice and used for EmaraTax linking.')}</p>
      {ok && <div className="alert success mb-2"><CheckCircle2 size={18} /> {t('Company saved.')}</div>}

      <fieldset className="form-section">
        <legend><Building2 size={15} /> {t('Business details')}</legend>
        <div className="form-grid">
          {Field({ k: 'name', label: 'Trading name *', placeholder: 'ABC Trading LLC' })}
          {Field({ k: 'legalName', label: 'Legal (registered) name', hint: 'As on the trade licence. Defaults to the trading name.' })}
          {Field({ k: 'trn', label: 'TRN *', ltr: true, inputMode: 'numeric', maxLength: 15, placeholder: '100XXXXXXXXXXXX' })}
          {Field({ k: 'tradeLicense', label: 'Trade licence number *', ltr: true })}
          {Field({ k: 'tin', label: 'TIN (10 digits)', ltr: true, inputMode: 'numeric', maxLength: 10, hint: 'Your Peppol ID is 0235:TIN, retrieved after linking.' })}
          <div className="field"><label>{t('Peppol ID')}</label><input className="input" dir="ltr" value={user.linking?.peppolId || '—'} readOnly /><span className="hint">{t('Read only. Retrieved from the technical partner after EmaraTax linking.')}</span></div>
          <label className="checkbox field"><input type="checkbox" checked={f.vatRegistered === false} onChange={(e) => { setOk(false); setF({ ...f, vatRegistered: !e.target.checked }); }} /> {t('Not registered for VAT')}</label>
          <div className="field"><label>{t('Issuing authority')}</label><select className="input" value={f.licenceIssuer} onChange={set('licenceIssuer')}><option value="">—</option>{getPlatform().registration.licenceIssuers.map((x) => <option key={x}>{x}</option>)}</select></div>
          {Field({ k: 'licenceExpiry', label: 'Licence expiry date', ltr: true, type: 'date' })}
          <div className="field"><label>{t('Business activity')}</label><select className="input" value={f.activity} onChange={set('activity')}><option value="">—</option>{getPlatform().registration.activities.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></div>
          {Field({ k: 'emaraTaxEmail', label: 'Email registered in EmaraTax', ltr: true, type: 'email' })}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><MapPin size={15} /> {t('Address')}</legend>
        <div className="form-grid">
          {Field({ k: 'street', label: 'Street *', full: true })}
          {Field({ k: 'additionalStreet', label: 'Additional street / building' })}
          {Field({ k: 'city', label: 'City *' })}
          {Field({ k: 'postalZone', label: 'P.O. Box / postal code', ltr: true })}
          <div className="field"><label>{t('Emirate')}</label>
            <select className="input" value={f.emirate} onChange={set('emirate')}>
              {EMIRATES.map((x) => <option key={x} value={x}>{t(x)}</option>)}
            </select></div>
          <div className="field"><label>{t('Country *')}</label>
            <select className="input" value={f.country} onChange={set('country')}>
              {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{t(x.label)}</option>)}
            </select></div>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><Mail size={15} /> {t('Contact details')}</legend>
        <div className="form-grid">
          {Field({ k: 'email', label: 'Email', ltr: true, type: 'email' })}
          {Field({ k: 'phone', label: 'Phone', ltr: true })}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><Landmark size={15} /> {t('Bank account for payments')}</legend>
        <div className="form-grid">
          {Field({ k: 'iban', label: 'IBAN', ltr: true, placeholder: 'AE07 0331 2345 6789 0123 456', hint: 'Printed on invoices as the payment account (credit transfer).' })}
          {Field({ k: 'bic', label: 'BIC / SWIFT', ltr: true })}
          {Field({ k: 'bankAccountName', label: 'Account name' })}
        </div>
      </fieldset>

      <button className="btn btn-primary mt-2" disabled={saving}>
        {saving ? <><Loader2 size={16} className="spin" /> {t('Saving…')}</> : t(user.company ? 'Update company' : 'Create company')}
      </button>
    </form>
  );
}
