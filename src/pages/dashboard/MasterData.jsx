import { useMemo, useState } from 'react';
import { Package, Users, Tags, Plus, Pencil, Trash2, Search, AlertCircle, Sparkles, CheckCircle2, Info, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { deleteRecord, loadSampleMasterData, list } from '../../services/masterData';
import { customerProblems } from '../../services/qvalia';
import { formatMoney } from '../../data/packages';
import { UNIT_CODES } from '../../data/ubl';
import { CustomerForm, ItemForm, CategoryForm } from './MasterForms';
import MasterImport from './MasterImport';

const TABS = {
  customers: { icon: Users, title: 'Customers', add: 'Add customer', empty: 'No customers yet.' },
  products: { icon: Package, title: 'Items', add: 'Add item', empty: 'No products or services yet.' },
  categories: { icon: Tags, title: 'Categories', add: 'Add category', empty: 'No categories yet.' },
};
const unitLabel = (code) => UNIT_CODES.find((u) => u.code === code)?.label || code;

const PAGES = {
  customers: { title: 'Customers', desc: 'The buyers you invoice. Each one needs a TRN (or Peppol ID) and an address to receive e-invoices.', sections: ['customers'] },
  categories: { title: 'Categories', desc: 'Groups for your items. A category sets the default unit, VAT category and classification of new items.', sections: ['categories'] },
  items: { title: 'Items', desc: 'Products and services you sell. Unit and VAT category go on every invoice line.', sections: ['products'] },
};

export default function MasterData({ page = 'customers' }) {
  const cfg = PAGES[page];
  const initialTab = cfg.sections[0];
  const { user, can } = useAuth();
  const edit = can('masterdata.edit');
  const { t } = useLang();
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // { collection, record }
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  const data = { customers: list(user, 'customers'), products: list(user, 'products'), categories: list(user, 'categories') };
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? data[tab].filter((x) => Object.values(x).some((v) => String(v).toLowerCase().includes(s))) : data[tab];
  }, [user, tab, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const catName = (id) => data.categories.find((c) => c.id === id)?.name || '—';
  const isEmpty = !data.customers.length && !data.products.length && !data.categories.length;
  const open = (record = {}) => { if (!edit) return; setError(null); setEditing({ collection: tab, record }); };
  const remove = (id) => { setError(null); try { deleteRecord(user, tab, id); } catch (err) { setError(err); } };

  return (
    <div className="card">
      <div className="flex between items-center wrap gap-2 mb-2">
        <div>
          <h3 className="mb-0">{t(cfg.title)}</h3>
          <p className="muted mb-0" style={{ fontSize: 14 }}>{t(cfg.desc)}</p>
        </div>
        {isEmpty && edit && <button className="btn btn-outline btn-sm" onClick={() => loadSampleMasterData(user)}><Sparkles size={15} /> {t('Load sample data')}</button>}
      </div>

      {cfg.sections.length > 1 && <div className="subtabs">
        {Object.entries(TABS).filter(([key]) => cfg.sections.includes(key)).map(([key, c]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => { setTab(key); setQ(''); setError(null); }}>
            <c.icon size={16} /> {t(c.title)} <span className="subtab-count">{data[key].length}</span>
          </button>
        ))}
      </div>}

      <div className={`flex between items-center wrap gap-1 mb-2 ${cfg.sections.length > 1 ? 'mt-2' : ''}`}>
        <div className="input-wrap" style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Search size={16} />
          <input className="input" placeholder={t('Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!edit && <span className="readonly-note"><Info size={14} /> {t('Read only for your role')}</span>}
        {edit && <div className="flex gap-1">
          <button className="btn btn-outline btn-sm" onClick={() => setImporting(true)}><FileSpreadsheet size={16} /> {t('Import from Excel')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => open({})}><Plus size={16} /> {t(TABS[tab].add)}</button>
        </div>}
      </div>

      {error && <div className="alert error mb-2"><AlertCircle size={18} /> {errText(t, error)}</div>}

      <div className="table-wrap">
        <table className="table-click">
          <thead>
            {tab === 'customers' && <tr><th>{t('Customer')}</th><th>{t('TRN')}</th><th>{t('City')}</th><th>{t('Contact')}</th><th>{t('E-invoice')}</th><th /></tr>}
            {tab === 'products' && <tr><th>{t('Item')}</th><th>{t('Category')}</th><th>{t('SKU / code')}</th><th>{t('Unit')}</th><th>{t('Price')}</th><th>{t('VAT')}</th><th /></tr>}
            {tab === 'categories' && <tr><th>{t('Category')}</th><th>{t('Default unit')}</th><th>{t('Default VAT')}</th><th>{t('Classification')}</th><th>{t('Items')}</th><th /></tr>}
          </thead>
          <tbody>
            {rows.map((r) => {
              const missing = tab === 'customers' ? customerProblems(r) : [];
              return (
                <tr key={r.id} onClick={() => open(r)}>
                  {tab === 'customers' && <>
                    <td><strong>{r.name}</strong>{r.legalName && r.legalName !== r.name && <div className="muted" style={{ fontSize: 12 }}>{r.legalName}</div>}</td>
                    <td dir="ltr" className="muted">{r.trn || '—'}</td>
                    <td>{r.city || '—'}{r.country && r.country !== 'AE' ? ` · ${r.country}` : ''}</td>
                    <td>{r.contactName || '—'}{r.email && <div className="muted" dir="ltr" style={{ fontSize: 12 }}>{r.email}</div>}</td>
                    <td>{missing.length
                      ? <span className="badge orange" title={missing.map((m) => t(m)).join(', ')}><Info size={12} /> {t('Incomplete')}</span>
                      : <span className="badge green"><CheckCircle2 size={12} /> {t('Ready')}</span>}</td>
                  </>}
                  {tab === 'products' && <>
                    <td><strong>{r.name}</strong>{r.description && <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>}</td>
                    <td>{catName(r.categoryId)}</td>
                    <td dir="ltr" className="muted">{r.sku || '—'}</td>
                    <td>{t(unitLabel(r.unitCode))} <span className="muted" dir="ltr">({r.unitCode})</span></td>
                    <td>{formatMoney(r.price)}</td>
                    <td><span className={`badge ${r.taxCategory === 'S' ? 'blue' : 'gray'}`} dir="ltr">{r.taxCategory} · {r.vatRate}%</span></td>
                  </>}
                  {tab === 'categories' && <>
                    <td><strong>{r.name}</strong>{r.description && <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>}</td>
                    <td>{r.defaultUnit ? `${t(unitLabel(r.defaultUnit))} (${r.defaultUnit})` : '—'}</td>
                    <td dir="ltr">{r.defaultTaxCategory || '—'}</td>
                    <td dir="ltr" className="muted">{r.classificationCode ? `${r.classificationList} ${r.classificationCode}` : '—'}</td>
                    <td>{data.products.filter((p) => p.categoryId === r.id).length}</td>
                  </>}
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>{edit && <>
                    <button className="icon-btn" onClick={() => open(r)} aria-label={t('Edit')}><Pencil size={15} /></button>
                    <button className="icon-btn danger" onClick={() => remove(r.id)} aria-label={t('Delete')}><Trash2 size={15} /></button>
                  </>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan="7" className="muted center" style={{ padding: 28 }}>{t(q ? 'No results.' : TABS[tab].empty)}</td></tr>}
          </tbody>
        </table>
      </div>

      {importing && <MasterImport collection={tab} onClose={() => setImporting(false)} />}
      {editing?.collection === 'customers' && <CustomerForm initial={editing.record} onClose={() => setEditing(null)} />}
      {editing?.collection === 'products' && <ItemForm initial={editing.record} onClose={() => setEditing(null)} />}
      {editing?.collection === 'categories' && <CategoryForm initial={editing.record} onClose={() => setEditing(null)} />}
    </div>
  );
}
