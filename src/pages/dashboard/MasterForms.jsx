import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle, CheckCircle2, Building2, MapPin, Mail, Receipt, Globe2, Package, Tag, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { saveRecord, normalizeCustomer, normalizeItem, normalizeCategory, list } from '../../services/masterData';
import { customerProblems } from '../../services/qvalia';
import { UNIT_CODES, TAX_CATEGORIES, CLASSIFICATION_LISTS, COUNTRIES, EMIRATES, ENDPOINT_SCHEMES } from '../../data/ubl';

/* ---------------- Modal shell ---------------- */
export function Modal({ title, icon: Icon, onClose, children, footer, wide = false }) {
  const { t } = useLang();
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);
  // Rendered in <body> so a dialog opened from inside another form never nests <form> elements.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3 className="mb-0 flex items-center gap-1">{Icon && <Icon size={20} />} {title}</h3>
          <button type="button" className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const Section = ({ icon: Icon, title, children }) => (
  <fieldset className="form-section">
    <legend><Icon size={15} /> {title}</legend>
    <div className="form-grid">{children}</div>
  </fieldset>
);

const F = ({ label, children, full, hint }) => (
  <div className={`field ${full ? 'full' : ''}`}>
    <label>{label}</label>
    {children}
    {hint && <span className="hint">{hint}</span>}
  </div>
);

/* ---------------- Customer ---------------- */
export function CustomerForm({ initial, onClose, onSaved }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [c, setC] = useState(() => normalizeCustomer(initial || {}));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));
  const missing = customerProblems(c);

  const save = (e) => {
    e?.preventDefault(); e?.stopPropagation();
    setError(null); setBusy(true);
    try {
      const rec = saveRecord(user, 'customers', { ...c, peppolId: c.peppolId || c.trn });
      onSaved?.(rec); onClose();
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      title={t(c.id ? 'Edit customer' : 'New customer')}
      icon={Building2}
      onClose={onClose}
      wide
      footer={<>
        <span className={`ready-pill ${missing.length ? 'warn' : 'ok'}`}>
          {missing.length ? <><Info size={14} /> {t('Needed for e-invoicing: {fields}', { fields: missing.map((m) => t(m)).join(', ') })}</> : <><CheckCircle2 size={14} /> {t('Ready for e-invoicing')}</>}
        </span>
        <div className="flex gap-1">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : t(c.id ? 'Save changes' : 'Add customer')}</button>
        </div>
      </>}
    >
      <form onSubmit={save} noValidate>
        {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
        <Section icon={Building2} title={t('Business details')}>
          <F label={t('Trading name *')}><input className="input" autoFocus value={c.name} onChange={set('name')} /></F>
          <F label={t('Legal (registered) name')} hint={t('As on the trade licence. Defaults to the trading name.')}><input className="input" value={c.legalName} onChange={set('legalName')} /></F>
          <F label={t('TRN')} hint={t('15-digit Tax Registration Number')}><input className="input" dir="ltr" inputMode="numeric" maxLength={15} value={c.trn} onChange={set('trn')} /></F>
          <F label={t('Trade licence number')}><input className="input" dir="ltr" value={c.tradeLicense} onChange={set('tradeLicense')} /></F>
        </Section>
        <Section icon={Globe2} title={t('Peppol electronic address')}>
          <F label={t('Peppol ID')} hint={t('Leave empty to use the TRN.')}><input className="input" dir="ltr" placeholder={c.trn || ''} value={c.peppolId} onChange={set('peppolId')} /></F>
          <F label={t('Scheme')}>
            <select className="input" value={c.endpointScheme} onChange={set('endpointScheme')}>
              {ENDPOINT_SCHEMES.map((s) => <option key={s.code} value={s.code}>{s.code} · {t(s.label)}</option>)}
            </select>
          </F>
        </Section>
        <Section icon={MapPin} title={t('Address')}>
          <F label={t('Street *')} full><input className="input" value={c.street} onChange={set('street')} /></F>
          <F label={t('Additional street / building')}><input className="input" value={c.additionalStreet} onChange={set('additionalStreet')} /></F>
          <F label={t('City *')}><input className="input" value={c.city} onChange={set('city')} /></F>
          <F label={t('P.O. Box / postal code')}><input className="input" dir="ltr" value={c.postalZone} onChange={set('postalZone')} /></F>
          <F label={t('Country *')}>
            <select className="input" value={c.country} onChange={set('country')}>
              {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{t(x.label)}</option>)}
            </select>
          </F>
          {c.country === 'AE' && (
            <F label={t('Emirate')}>
              <select className="input" value={c.emirate} onChange={set('emirate')}>
                <option value="">—</option>
                {EMIRATES.map((x) => <option key={x} value={x}>{t(x)}</option>)}
              </select>
            </F>
          )}
        </Section>
        <Section icon={Mail} title={t('Contact details')}>
          <F label={t('Contact person')}><input className="input" value={c.contactName} onChange={set('contactName')} /></F>
          <F label={t('Email')}><input className="input" dir="ltr" type="email" value={c.email} onChange={set('email')} /></F>
          <F label={t('Phone')}><input className="input" dir="ltr" value={c.phone} onChange={set('phone')} /></F>
        </Section>
        <Section icon={Receipt} title={t('Invoicing defaults')}>
          <F label={t('Buyer reference')} hint={t('Reference the buyer asked you to quote on invoices.')}><input className="input" dir="ltr" value={c.buyerReference} onChange={set('buyerReference')} /></F>
          <F label={t('Payment terms (days)')}><input className="input" dir="ltr" type="number" min="0" value={c.paymentDays} onChange={set('paymentDays')} /></F>
        </Section>
      </form>
    </Modal>
  );
}

/* ---------------- Item (product / service) ---------------- */
export function ItemForm({ initial, onClose, onSaved }) {
  const { user } = useAuth();
  const { t } = useLang();
  const categories = list(user, 'categories');
  const [p, setP] = useState(() => {
    const base = normalizeItem(initial || {});
    if (!initial?.id && initial?.categoryId) {
      const cat = categories.find((c) => c.id === initial.categoryId);
      if (cat) Object.assign(base, { unitCode: cat.defaultUnit || base.unitCode, taxCategory: cat.defaultTaxCategory || base.taxCategory, classificationList: cat.classificationList, classificationCode: cat.classificationCode });
    }
    return base;
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));

  const pickCategory = (id) => {
    const cat = categories.find((c) => c.id === id);
    setP((x) => ({
      ...x, categoryId: id,
      ...(cat ? {
        unitCode: cat.defaultUnit || x.unitCode,
        taxCategory: cat.defaultTaxCategory || x.taxCategory,
        classificationList: x.classificationCode ? x.classificationList : cat.classificationList,
        classificationCode: x.classificationCode || cat.classificationCode,
      } : {}),
    }));
  };

  const save = (e) => {
    e?.preventDefault(); e?.stopPropagation(); setError(null);
    try { const rec = saveRecord(user, 'products', p); onSaved?.(rec); onClose(); } catch (err) { setError(err); }
  };

  return (
    <Modal
      title={t(p.id ? 'Edit item' : 'New item')}
      icon={Package}
      onClose={onClose}
      wide
      footer={<>
        <span />
        <div className="flex gap-1">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>{t(p.id ? 'Save changes' : 'Add item')}</button>
        </div>
      </>}
    >
      <form onSubmit={save} noValidate>
        {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
        <Section icon={Package} title={t('Item')}>
          <F label={t('Name *')}><input className="input" autoFocus value={p.name} onChange={set('name')} /></F>
          <F label={t('Type')}>
            <select className="input" value={p.type} onChange={set('type')}>
              {['Service', 'Product'].map((x) => <option key={x} value={x}>{t(x)}</option>)}
            </select>
          </F>
          <F label={t('Description')} full><input className="input" value={p.description} onChange={set('description')} /></F>
          <F label={t('Category')} hint={t('Sets the default unit, VAT and classification.')}>
            <select className="input" value={p.categoryId} onChange={(e) => pickCategory(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </F>
          <F label={t('SKU / code')} hint={t('Your own item code (seller item ID).')}><input className="input" dir="ltr" value={p.sku} onChange={set('sku')} /></F>
        </Section>
        <Section icon={Receipt} title={t('Price & VAT')}>
          <F label={t('Unit price (AED) *')}><input className="input" dir="ltr" type="number" min="0" step="0.01" value={p.price} onChange={set('price')} /></F>
          <F label={t('Unit *')}>
            <select className="input" value={p.unitCode} onChange={set('unitCode')}>
              {UNIT_CODES.map((u) => <option key={u.code} value={u.code}>{t(u.label)} ({u.code})</option>)}
            </select>
          </F>
          <F label={t('VAT category *')} full>
            <div className="seg-choice">
              {TAX_CATEGORIES.map((c) => (
                <button type="button" key={c.code} className={p.taxCategory === c.code ? 'on' : ''} onClick={() => setP((x) => ({ ...x, taxCategory: c.code }))}>
                  <b>{c.code}</b> {t(c.label, { rate: c.rate })}
                </button>
              ))}
            </div>
          </F>
        </Section>
        <Section icon={Tag} title={t('Identification (optional)')}>
          <F label={t('Barcode / GTIN')}><input className="input" dir="ltr" value={p.gtin} onChange={set('gtin')} /></F>
          <F label={t('Country of origin')}>
            <select className="input" value={p.originCountry} onChange={set('originCountry')}>
              <option value="">—</option>
              {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{t(x.label)}</option>)}
              <option value="CN">{t('China')}</option><option value="DE">{t('Germany')}</option><option value="JP">{t('Japan')}</option>
            </select>
          </F>
          <F label={t('Classification scheme')}>
            <select className="input" value={p.classificationList} onChange={set('classificationList')}>
              <option value="">—</option>
              {CLASSIFICATION_LISTS.map((x) => <option key={x.code} value={x.code}>{x.code} · {t(x.label)}</option>)}
            </select>
          </F>
          <F label={t('Classification code')}><input className="input" dir="ltr" value={p.classificationCode} onChange={set('classificationCode')} /></F>
        </Section>
      </form>
    </Modal>
  );
}

/* ---------------- Category ---------------- */
export function CategoryForm({ initial, onClose, onSaved }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [c, setC] = useState(() => normalizeCategory(initial || {}));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));
  const save = (e) => {
    e?.preventDefault(); e?.stopPropagation(); setError(null);
    try { const rec = saveRecord(user, 'categories', c); onSaved?.(rec); onClose(); } catch (err) { setError(err); }
  };
  return (
    <Modal
      title={t(c.id ? 'Edit category' : 'New category')}
      icon={Tag}
      onClose={onClose}
      footer={<>
        <span />
        <div className="flex gap-1">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>{t(c.id ? 'Save changes' : 'Add category')}</button>
        </div>
      </>}
    >
      <form onSubmit={save} noValidate>
        {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
        <div className="form-grid">
          <F label={t('Name *')} full><input className="input" autoFocus value={c.name} onChange={set('name')} /></F>
          <F label={t('Description')} full><input className="input" value={c.description} onChange={set('description')} /></F>
          <F label={t('Default unit')}>
            <select className="input" value={c.defaultUnit} onChange={set('defaultUnit')}>
              <option value="">—</option>
              {UNIT_CODES.map((u) => <option key={u.code} value={u.code}>{t(u.label)} ({u.code})</option>)}
            </select>
          </F>
          <F label={t('Default VAT category')}>
            <select className="input" value={c.defaultTaxCategory} onChange={set('defaultTaxCategory')}>
              <option value="">—</option>
              {TAX_CATEGORIES.map((x) => <option key={x.code} value={x.code}>{x.code} · {t(x.label, { rate: x.rate })}</option>)}
            </select>
          </F>
          <F label={t('Classification scheme')}>
            <select className="input" value={c.classificationList} onChange={set('classificationList')}>
              <option value="">—</option>
              {CLASSIFICATION_LISTS.map((x) => <option key={x.code} value={x.code}>{x.code} · {t(x.label)}</option>)}
            </select>
          </F>
          <F label={t('Classification code')}><input className="input" dir="ltr" value={c.classificationCode} onChange={set('classificationCode')} /></F>
        </div>
        <p className="muted mt-2 mb-0" style={{ fontSize: 13 }}>{t('New items in this category start with these defaults.')}</p>
      </form>
    </Modal>
  );
}
