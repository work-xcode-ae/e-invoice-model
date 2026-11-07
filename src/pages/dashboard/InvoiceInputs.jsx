import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Loader2, CheckCircle2, XCircle, AlertTriangle, Upload, Download, FileSpreadsheet,
  Copy, KeyRound, RefreshCcw, PackagePlus, Send, Play, UserPlus, Pencil, Building2, Info, RotateCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { createInvoices, computeTotals } from '../../services/invoices';
import { updateUser } from '../../services/api';
import { list } from '../../services/masterData';
import { customerProblems } from '../../services/qvalia';
import { formatMoney } from '../../data/packages';
import { TAX_CATEGORIES, UNIT_CODES, taxRate } from '../../data/ubl';
import { CustomerForm, ItemForm } from './MasterForms';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };

/** Translate a validation error; field lists ("TRN or Peppol ID, city") are translated piece by piece. */
export const errorText = (t, e) => {
  const vars = { ...(e.vars || {}) };
  if (vars.translateFields && vars.fields) vars.fields = vars.fields.split(', ').map((f) => t(f)).join('، ');
  return t(e.key, vars);
};

/* ---------------- Validation / limit results ---------------- */
export function ResultPanel({ result, onClose, onFix }) {
  const { t } = useLang();
  const { user, setCart } = useAuth();
  const navigate = useNavigate();
  if (!result) return null;
  const { created = [], rejected = [], blocked } = result;

  if (blocked) {
    const limit = blocked.code === 'LIMIT' || blocked.code === 'EXPIRED';
    return (
      <div className="result-panel lvl-danger">
        <div className="rp-head"><AlertTriangle size={22} /><strong>{t(blocked.code === 'LIMIT' ? 'Limit exceeded' : 'Package check failed')}</strong></div>
        <p>{t(blocked.key, blocked.vars)}</p>
        {limit && <p className="muted">{t('Renew your package or purchase additional transactions.')}</p>}
        <div className="flex gap-1 wrap">
          {limit && user.subscription && (
            <button className="btn btn-primary btn-sm" onClick={() => { setCart({ type: 'package', packageId: user.subscription.packageId, months: 1 }); navigate('/cart'); }}>
              <RefreshCcw size={15} /> {t('Renew package')}
            </button>
          )}
          {limit && <button className="btn btn-outline btn-sm" onClick={() => navigate('/packages#addons')}><PackagePlus size={15} /> {t('Buy add-on')}</button>}
          {blocked.code === 'USERS' && <button className="btn btn-outline btn-sm" onClick={() => navigate('/dashboard?tab=users')}>{t('Manage users')}</button>}
          {blocked.code === 'NO_PACKAGE' && <button className="btn btn-primary btn-sm" onClick={() => navigate('/packages')}>{t('Choose a package')}</button>}
          <button className="btn btn-outline btn-sm" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`result-panel ${rejected.length && !created.length ? 'lvl-danger' : created.length && !rejected.length ? 'lvl-success' : 'lvl-warning'}`}>
      {created.length > 0 && (
        <>
          <div className="rp-head"><CheckCircle2 size={22} /><strong>{t('{n} invoice(s) passed validation and were added to the queue.', { n: created.length })}</strong></div>
          <p className="muted" style={{ fontSize: 13 }}>{t('Each one is converted to a UBL e-invoice and sent to Qvalia. Open an invoice to see the payload and response.')}</p>
          <div className="rp-list">
            {created.slice(0, 6).map((i) => <span key={i.id} className="chip-mini" dir="ltr">{i.id} · {i.queueId}</span>)}
            {created.length > 6 && <span className="chip-mini">+{created.length - 6}</span>}
          </div>
        </>
      )}
      {rejected.length > 0 && (
        <>
          <div className="rp-head mt-1"><XCircle size={22} /><strong>{t('Validation failed for {n} invoice(s)', { n: rejected.length })}</strong></div>
          <ul className="rp-errors">
            {rejected.slice(0, 10).map((r) => (
              <li key={r.index}>
                <b>{r.ref ? r.ref : t('Invoice {n}', { n: r.index + 1 })}:</b> {r.errors.map((e) => errorText(t, e)).join(' · ')}
                {onFix && <FixButtons errors={r.errors} draft={r.draft} onFix={onFix} />}
              </li>
            ))}
          </ul>
        </>
      )}
      <button className="btn btn-outline btn-sm mt-1" onClick={onClose}>{t('Close')}</button>
    </div>
  );
}

/** Quick fixes next to validation errors: add/edit the customer or add the missing item. */
function FixButtons({ errors, draft, onFix }) {
  const { t } = useLang();
  const { user } = useAuth();
  const btns = [];
  errors.forEach((e) => {
    if (e.key.startsWith('Customer not found')) btns.push(['add-customer', <><UserPlus size={13} /> {t('Add customer')}</>, { name: draft?.customerName || '', trn: draft?.customerTrn || '' }]);
    if (e.key.startsWith('Customer {name} is missing')) {
      const c = list(user, 'customers').find((x) => x.name === e.vars.name);
      if (c) btns.push(['edit-customer', <><Pencil size={13} /> {t('Edit customer')}</>, c]);
    }
    if (e.key.startsWith('Line {n}: product or service not found')) btns.push(['add-item', <><Plus size={13} /> {t('Add item')}</>, { name: e.vars.name === '—' ? '' : e.vars.name, sku: e.vars.name === '—' ? '' : e.vars.name }]);
    if (e.key.startsWith('Your company')) btns.push(['company', <><Building2 size={13} /> {t('Company details')}</>, null]);
  });
  const seen = new Set();
  const unique = btns.filter(([k, , d]) => { const id = k + JSON.stringify(d?.name || d?.id || ''); if (seen.has(id)) return false; seen.add(id); return true; });
  if (!unique.length) return null;
  return <span className="fix-btns">{unique.map(([k, label, data], i) => <button key={i} type="button" className="link-btn" onClick={() => onFix(k, data)}>{label}</button>)}</span>;
}

/** Hosts the customer / item dialogs opened from quick-fix buttons. */
function useFixDialogs() {
  const navigate = useNavigate();
  const [dlg, setDlg] = useState(null);
  const onFix = (kind, data) => {
    if (kind === 'company') { navigate('/dashboard?tab=company'); return; }
    setDlg({ kind, data });
  };
  const dialogs = (
    <>
      {dlg?.kind === 'add-customer' && <CustomerForm initial={dlg.data} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'edit-customer' && <CustomerForm initial={dlg.data} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'add-item' && <ItemForm initial={dlg.data} onClose={() => setDlg(null)} />}
    </>
  );
  return { onFix, dialogs };
}

/* ---------------- Manual entry ---------------- */
const blankLine = () => ({ productId: '', qty: 1, price: '', unitCode: 'C62', taxCategory: 'S', description: '' });

export function ManualInvoice({ onDone }) {
  const { user } = useAuth();
  const { t } = useLang();
  const products = list(user, 'products');
  const customers = list(user, 'customers');
  const [draft, setDraft] = useState({ customerId: '', issueDate: today(), dueDate: '', buyerReference: '', orderReference: '', items: [blankLine()], applyDiscount: false, discountPct: 0, notes: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: 'customer'|'item', record, line }
  const { onFix, dialogs } = useFixDialogs();

  const customer = customers.find((c) => c.id === draft.customerId);
  const missing = customerProblems(customer);
  const totals = useMemo(() => computeTotals(draft.items.filter((i) => i.productId), { discountPct: draft.applyDiscount ? draft.discountPct : 0, issueDate: draft.issueDate }), [draft]);

  const setLine = (i, patch) => setDraft((d) => ({ ...d, items: d.items.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const applyProduct = (i, p) => setLine(i, { productId: p.id, price: p.price, unitCode: p.unitCode, taxCategory: p.taxCategory, description: p.description });
  const pickProduct = (i, id) => {
    if (id === '__new') { setDialog({ kind: 'item', record: {}, line: i }); return; }
    const p = products.find((x) => x.id === id);
    if (p) applyProduct(i, p); else setLine(i, blankLine());
  };
  const pickCustomer = (id) => {
    if (id === '__new') { setDialog({ kind: 'customer', record: {} }); return; }
    const c = customers.find((x) => x.id === id);
    setDraft((d) => ({ ...d, customerId: id, buyerReference: d.buyerReference || c?.buyerReference || '', dueDate: c ? addDays(d.issueDate, c.paymentDays) : d.dueDate }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 450));
    const res = createInvoices(user.id, [{
      customerId: draft.customerId, issueDate: draft.issueDate, dueDate: draft.dueDate, notes: draft.notes,
      buyerReference: draft.buyerReference, orderReference: draft.orderReference,
      discountPct: draft.applyDiscount ? Number(draft.discountPct) : 0,
      items: draft.items.filter((l) => l.productId || l.price !== '').map((l) => ({ ...l, vatRate: taxRate(l.taxCategory) })),
    }], 'Manual');
    setBusy(false);
    setResult(res);
    if (res.created.length) setDraft({ customerId: '', issueDate: today(), dueDate: '', buyerReference: '', orderReference: '', items: [blankLine()], applyDiscount: false, discountPct: 0, notes: '' });
  };

  return (
    <form onSubmit={submit} noValidate>
      <ResultPanel result={result} onClose={() => { setResult(null); if (result?.created?.length) onDone?.('list'); }} onFix={onFix} />

      {/* Buyer */}
      <div className="form-grid">
        <div className="field">
          <label>{t('Customer *')}</label>
          <div className="input-with-btn">
            <select className="input" value={draft.customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">{t('Select customer')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">＋ {t('New customer…')}</option>
            </select>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'customer', record: {} })} title={t('New customer')}><UserPlus size={15} /></button>
          </div>
        </div>
        <div className="form-grid" style={{ gap: 12 }}>
          <div className="field">
            <label>{t('Issue date *')}</label>
            <input className="input" type="date" dir="ltr" value={draft.issueDate} onChange={(e) => setDraft({ ...draft, issueDate: e.target.value, dueDate: customer ? addDays(e.target.value, customer.paymentDays) : draft.dueDate })} />
          </div>
          <div className="field">
            <label>{t('Due date')}</label>
            <input className="input" type="date" dir="ltr" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          </div>
        </div>
      </div>

      {customer && (
        <div className={`buyer-card ${missing.length ? 'warn' : ''}`}>
          <div>
            <strong>{customer.legalName || customer.name}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              <span dir="ltr">{t('TRN')}: {customer.trn || '—'}</span> · {[customer.street, customer.city, customer.country].filter(Boolean).join(', ') || t('No address')}
            </div>
            {missing.length > 0 && <div className="buyer-missing"><Info size={14} /> {t('Needed for e-invoicing: {fields}', { fields: missing.map((m) => t(m)).join('، ') })}</div>}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'customer', record: customer })}><Pencil size={14} /> {t('Edit customer')}</button>
        </div>
      )}

      <div className="form-grid mt-2">
        <div className="field"><label>{t('Buyer reference')}</label><input className="input" dir="ltr" value={draft.buyerReference} onChange={(e) => setDraft({ ...draft, buyerReference: e.target.value })} /></div>
        <div className="field"><label>{t('Purchase order number')}</label><input className="input" dir="ltr" value={draft.orderReference} onChange={(e) => setDraft({ ...draft, orderReference: e.target.value })} /></div>
      </div>

      {/* Lines */}
      <div className="lines mt-2">
        <div className="line line-head">
          <span>{t('Item')}</span><span>{t('Qty')}</span><span>{t('Unit')}</span><span>{t('Price')}</span><span>{t('VAT')}</span><span>{t('Amount')}</span><span />
        </div>
        {draft.items.map((l, i) => {
          const net = (Number(l.qty) || 0) * (Number(l.price) || 0);
          return (
            <div className="line" key={i}>
              <div className="line-item">
                <select className="input" value={l.productId} onChange={(e) => pickProduct(i, e.target.value)} aria-label={t('Item')}>
                  <option value="">{t('Select product / service')}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ''}</option>)}
                  <option value="__new">＋ {t('New item…')}</option>
                </select>
                {l.productId && <input className="input input-sm line-desc" placeholder={t('Description')} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />}
              </div>
              <input className="input" type="number" min="0" step="any" dir="ltr" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={t('Qty')} />
              <select className="input" value={l.unitCode} onChange={(e) => setLine(i, { unitCode: e.target.value })} aria-label={t('Unit')}>
                {UNIT_CODES.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
              </select>
              <input className="input" type="number" min="0" step="0.01" dir="ltr" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} aria-label={t('Price')} />
              <select className="input" value={l.taxCategory} onChange={(e) => setLine(i, { taxCategory: e.target.value })} aria-label={t('VAT')} title={t(TAX_CATEGORIES.find((c) => c.code === l.taxCategory)?.label || '', { rate: TAX_CATEGORIES.find((c) => c.code === l.taxCategory)?.rate })}>
                {TAX_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.rate}%</option>)}
              </select>
              <span className="line-amt">{formatMoney(net)}</span>
              <button type="button" className="icon-btn danger" disabled={draft.items.length === 1} onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, k) => k !== i) }))} aria-label={t('Remove')}><Trash2 size={15} /></button>
            </div>
          );
        })}
        <div className="flex gap-1 wrap">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, blankLine()] }))}><Plus size={15} /> {t('Add line')}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'item', record: {}, line: draft.items.length - 1 })}><PackagePlus size={15} /> {t('New item')}</button>
        </div>
      </div>

      <div className="inv-bottom mt-2">
        <div className="field" style={{ flex: 1 }}>
          <label className="checkbox">
            <input type="checkbox" checked={draft.applyDiscount} onChange={(e) => setDraft({ ...draft, applyDiscount: e.target.checked })} /> {t('Discount')}
          </label>
          {draft.applyDiscount && (
            <div className="flex items-center gap-1"><input className="input" style={{ maxWidth: 110 }} type="number" min="0" max="100" dir="ltr" value={draft.discountPct} onChange={(e) => setDraft({ ...draft, discountPct: e.target.value })} /> %</div>
          )}
          <label className="mt-1">{t('Notes')}</label>
          <textarea className="input" style={{ minHeight: 70 }} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="inv-totals">
          <div className="summary-row"><span>{t('Subtotal')}</span><span>{formatMoney(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="summary-row"><span>{t('Discount')}</span><span>−{formatMoney(totals.discount)}</span></div>}
          {totals.groups.map((g) => (
            <div className="summary-row" key={`${g.taxCategory}${g.rate}`}><span>{t('VAT')} <span dir="ltr">{g.taxCategory} {g.rate}%</span></span><span>{formatMoney(g.tax)}</span></div>
          ))}
          <div className="summary-row total"><span>{t('Total')}</span><span>{formatMoney(totals.total)}</span></div>
          <button className="btn btn-primary btn-block mt-2" disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> {t('Validating…')}</> : <><Send size={16} /> {t('Create invoice')}</>}
          </button>
        </div>
      </div>

      {dialog?.kind === 'customer' && (
        <CustomerForm initial={dialog.record} onClose={() => setDialog(null)} onSaved={(rec) => setDraft((d) => ({ ...d, customerId: rec.id, buyerReference: d.buyerReference || rec.buyerReference || '', dueDate: addDays(d.issueDate, rec.paymentDays ?? 30) }))} />
      )}
      {dialog?.kind === 'item' && (
        <ItemForm initial={dialog.record} onClose={() => setDialog(null)} onSaved={(rec) => {
          const target = draft.items[dialog.line]?.productId ? draft.items.length : dialog.line;
          setDraft((d) => {
            const items = target >= d.items.length ? [...d.items, blankLine()] : [...d.items];
            items[target] = { productId: rec.id, qty: items[target].qty || 1, price: rec.price, unitCode: rec.unitCode, taxCategory: rec.taxCategory, description: rec.description };
            return { ...d, items };
          });
        }} />
      )}
      {dialogs}
    </form>
  );
}

/* ---------------- Excel upload ---------------- */
const TEMPLATE_HEADERS = ['InvoiceRef', 'IssueDate', 'DueDate', 'CustomerTRN', 'Customer', 'ItemSKU', 'Description', 'Qty', 'Unit', 'UnitPrice', 'VATCategory', 'BuyerReference'];

const cellDate = (v) => (v instanceof Date ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(v || '').trim().slice(0, 10));
const cell = (r, ...names) => { for (const n of names) if (r[n] !== undefined && r[n] !== '') return r[n]; return ''; };

export function ExcelUpload() {
  const { user } = useAuth();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [retryDrafts, setRetryDrafts] = useState(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const { onFix, dialogs } = useFixDialogs();

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const cs = list(user, 'customers'); const ps = list(user, 'products');
    const c1 = cs[0] || { trn: '100345678900003', name: 'Al Noor LLC' }; const c2 = cs[1] || c1;
    const p1 = ps[0] || { sku: 'SRV-001', unitCode: 'HUR', price: 450, taxCategory: 'S' }; const p2 = ps[2] || ps[1] || p1;
    const d = today(); const due = addDays(d, 30);
    const rows = [
      TEMPLATE_HEADERS,
      ['EXT-001', d, due, c1.trn, c1.name, p1.sku, '', 2, p1.unitCode, p1.price, p1.taxCategory, 'PO-4411'],
      ['EXT-001', d, due, c1.trn, c1.name, p2.sku, '', 1, p2.unitCode, p2.price, p2.taxCategory, 'PO-4411'],
      ['EXT-002', d, '', c2.trn, c2.name, p1.sku, 'March retainer', 5, p1.unitCode, '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [12, 12, 12, 18, 26, 12, 22, 6, 6, 10, 12, 14].map((w) => ({ wch: w }));
    const help = XLSX.utils.aoa_to_sheet([
      ['Column', 'Required', 'Notes'],
      ['InvoiceRef', 'yes', 'Rows with the same reference become one invoice. Used as Idempotency-Key (no duplicates).'],
      ['IssueDate / DueDate', 'IssueDate', 'YYYY-MM-DD. DueDate defaults to the customer payment terms.'],
      ['CustomerTRN or Customer', 'one of them', 'Must match a customer in Customers.'],
      ['ItemSKU', 'yes', 'SKU or item name from Items.'],
      ['Qty', 'yes', ''],
      ['Unit / UnitPrice / VATCategory', 'no', `Defaults come from the item. VATCategory: S (${TAX_CATEGORIES[0].rate}%), Z (0%), E (exempt), O (out of scope).`],
      ['BuyerReference', 'no', 'Buyer reference / PO quoted on the e-invoice.'],
    ]);
    help['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.utils.book_append_sheet(wb, help, 'Help');
    XLSX.writeFile(wb, 'MEI-invoice-template.xlsx');
  };

  const readFile = async (file) => {
    if (!file) return;
    setResult(null); setRetryDrafts(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setPreview({ error: t('Unsupported file. Use the .xlsx template.') }); return; }
    setFileName(file.name);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const groups = new Map();
    rows.forEach((r, i) => {
      const ref = String(cell(r, 'InvoiceRef') || `ROW-${i + 2}`).trim();
      if (!groups.has(ref)) {
        groups.set(ref, {
          externalRef: ref, issueDate: cellDate(cell(r, 'IssueDate')), dueDate: cellDate(cell(r, 'DueDate')) || undefined,
          customerTrn: String(cell(r, 'CustomerTRN') || '').trim() || undefined, customerName: String(cell(r, 'Customer') || '').trim() || undefined,
          buyerReference: String(cell(r, 'BuyerReference') || '').trim() || undefined, items: [], rows: [],
        });
      }
      const g = groups.get(ref);
      const key = String(cell(r, 'ItemSKU', 'Item') || '').trim();
      const vatPct = cell(r, 'VAT%');
      const cat = String(cell(r, 'VATCategory') || '').trim().toUpperCase() || (vatPct === '' ? undefined : Number(vatPct) === 0 ? 'Z' : 'S');
      g.items.push({
        sku: key, name: key, qty: cell(r, 'Qty'), description: String(cell(r, 'Description') || '').trim() || undefined,
        unitCode: String(cell(r, 'Unit') || '').trim() || undefined,
        price: cell(r, 'UnitPrice') === '' ? undefined : Number(cell(r, 'UnitPrice')),
        taxCategory: cat || undefined,
      });
      g.rows.push(i + 2);
    });
    setPreview({ invoices: [...groups.values()], rows: rows.length });
  };

  const send = async (drafts) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    const res = createInvoices(user.id, drafts, 'Excel');
    res.rejected = res.rejected.map((r) => ({ ...r, ref: `${r.ref} (${t('rows')} ${drafts[r.index].rows.join(', ')})` }));
    setResult(res);
    setRetryDrafts(res.blocked ? null : res.rejected.map((r) => drafts[r.index]));
    setBusy(false);
    if (res.created.length || res.rejected.length) setPreview(null);
  };

  return (
    <div>
      <ResultPanel result={result} onClose={() => setResult(null)} onFix={onFix} />
      {retryDrafts?.length > 0 && (
        <div className="alert info mb-2" style={{ alignItems: 'center' }}>
          <Info size={18} />
          <span style={{ flex: 1 }}>{t('Fix the customers or items above, then validate the {n} rejected invoice(s) again. Already queued invoices are not sent twice.', { n: retryDrafts.length })}</span>
          <button className="btn btn-primary btn-sm" onClick={() => send(retryDrafts)} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <RotateCw size={15} />} {t('Validate again')}</button>
        </div>
      )}
      <div className="excel-grid">
        <label
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files[0]); }}
        >
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
          <FileSpreadsheet size={34} />
          <strong>{t('Drop your Excel file here or click to choose')}</strong>
          <span className="muted">{t('Supported format: .xlsx (one row per invoice line)')}</span>
          {fileName && <span className="chip-mini" dir="ltr">{fileName}</span>}
        </label>
        <div className="card-soft">
          <h4>{t('How it works')}</h4>
          <ol className="steps-mini">
            <li>{t('Add your customers and items first (Customers and Items in the menu).')}</li>
            <li>{t('Download the template and add one row per invoice line. Rows with the same InvoiceRef become one invoice.')}</li>
            <li>{t('Upload. Each invoice is validated; errors are listed per row with a quick fix.')}</li>
            <li>{t('Valid invoices are converted to UBL and sent to Qvalia through the API.')}</li>
          </ol>
          <button className="btn btn-outline btn-sm" onClick={downloadTemplate}><Download size={15} /> {t('Download template')}</button>
        </div>
      </div>

      {preview?.error && <div className="alert error mt-2"><XCircle size={18} /> {preview.error}</div>}
      {preview?.invoices && (
        <div className="mt-2">
          <div className="flex between items-center wrap gap-1 mb-1">
            <strong>{t('{n} invoice(s) found in {rows} row(s)', { n: preview.invoices.length, rows: preview.rows })}</strong>
            <button className="btn btn-primary btn-sm" onClick={() => send(preview.invoices)} disabled={busy}>
              {busy ? <><Loader2 size={15} className="spin" /> {t('Validating…')}</> : <><Upload size={15} /> {t('Validate & send')}</>}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Reference')}</th><th>{t('Date')}</th><th>{t('Customer')}</th><th>{t('Lines')}</th><th>{t('Rows')}</th></tr></thead>
              <tbody>
                {preview.invoices.slice(0, 20).map((g) => (
                  <tr key={g.externalRef}><td dir="ltr">{g.externalRef}</td><td dir="ltr">{g.issueDate}</td><td>{g.customerName || g.customerTrn || '—'}</td><td>{g.items.length}</td><td dir="ltr" className="muted">{g.rows.join(', ')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {dialogs}
    </div>
  );
}

/* ---------------- API / SDK ---------------- */
export function ApiPanel() {
  const { user } = useAuth();
  const { t } = useLang();
  const [copied, setCopied] = useState('');
  const c = list(user, 'customers')[0];
  const p = list(user, 'products')[0];
  const sample = JSON.stringify({
    invoices: [{
      externalRef: `ERP-${Math.floor(Math.random() * 9000 + 1000)}`,
      issueDate: today(),
      customerTrn: c?.trn || '100345678900003',
      buyerReference: 'PO-7781',
      items: [{ sku: p?.sku || 'SRV-001', qty: 2, unitCode: p?.unitCode || 'HUR', price: p?.price ?? 450, taxCategory: p?.taxCategory || 'S' }],
    }],
  }, null, 2);
  const [body, setBody] = useState(sample);
  const [response, setResponse] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = user.apiKey;

  const genKey = () => updateUser(user.id, { apiKey: `mei_live_${Math.random().toString(16).slice(2, 18)}` });
  const copy = (txt, id) => { try { navigator.clipboard.writeText(txt); } catch { /* ignore */ } setCopied(id); setTimeout(() => setCopied(''), 1500); };

  const run = async () => {
    setBusy(true); setResponse(null);
    await new Promise((r) => setTimeout(r, 500));
    let parsed;
    try { parsed = JSON.parse(body); } catch { setResponse({ status: 400, body: { error: 'Invalid data format', message: 'Body is not valid JSON.' } }); setBusy(false); return; }
    if (!key) { setResponse({ status: 401, body: { error: 'Unauthorized', message: 'Generate an API key first.' } }); setBusy(false); return; }
    if (user.subscription?.apiDisabled) { setResponse({ status: 403, body: { error: 'Forbidden', message: 'API access is disabled for this account.' } }); setBusy(false); return; }
    const res = createInvoices(user.id, parsed.invoices || [], 'API');
    const status = res.blocked ? 402 : res.created.length ? (res.rejected.length ? 207 : 202) : 422;
    setResponse({
      status,
      body: res.blocked
        ? { error: res.blocked.code, message: t(res.blocked.key, res.blocked.vars) }
        : {
            accepted: res.created.map((i) => ({ invoiceId: i.id, queueId: i.queueId, status: i.status })),
            rejected: res.rejected.map((r) => ({ index: r.index, errors: r.errors.map((e) => errorText(t, e)) })),
          },
    });
    setBusy(false);
  };

  const curl = `curl -X POST https://api.modelfc.ae/v1/invoices \\
  -H "Authorization: Bearer <OAUTH2_TOKEN>" \\
  -H "X-Api-Key: ${key || '<API_KEY>'}" \\
  -H "Idempotency-Key: <unique-ref>" \\
  -H "Content-Type: application/json" \\
  -d @invoices.json`;

  return (
    <div className="api-grid">
      <div>
        <h4 className="flex items-center gap-1"><KeyRound size={17} /> {t('API key')}</h4>
        <div className="key-box" dir="ltr">
          <code>{key ? `${key.slice(0, 12)}••••••••${key.slice(-4)}` : t('No API key yet')}</code>
          {key && <button className="icon-btn" onClick={() => copy(key, 'key')} aria-label={t('Copy')}><Copy size={15} /></button>}
          <button className="btn btn-outline btn-sm" onClick={genKey}>{t(key ? 'Regenerate' : 'Generate key')}</button>
        </div>
        {copied === 'key' && <small className="muted">{t('Copied')}</small>}

        <h4 className="mt-3">{t('Send invoices from your system')}</h4>
        <p className="muted" style={{ fontSize: 14 }}>{t('HTTPS with TLS 1.2+, OAuth2 token + API key. Each request is validated, checked against your package and queued.')}</p>
        <div className="code-wrap">
          <pre className="code" dir="ltr">{curl}</pre>
          <button className="icon-btn copy-code" onClick={() => copy(curl, 'curl')} aria-label={t('Copy')}><Copy size={15} /></button>
        </div>
        <div className="sdk mt-1"><span>.NET</span><span>Java</span><span>Python</span><span>PHP</span></div>
        <div className="mt-2 muted" style={{ fontSize: 13 }}>
          <b>{t('Response codes')}:</b> <span dir="ltr">202</span> {t('queued')} · <span dir="ltr">207</span> {t('partly queued')} · <span dir="ltr">402</span> {t('limit reached')} · <span dir="ltr">422</span> {t('validation failed')}
        </div>
      </div>
      <div>
        <h4 className="flex items-center gap-1"><Play size={17} /> {t('Try it (sandbox)')}</h4>
        <textarea className="input code-input" dir="ltr" spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn btn-primary btn-sm mt-1" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {t('Send request')}</button>
        {response && (
          <div className="mt-1">
            <span className={`badge ${response.status < 300 ? 'green' : response.status === 207 ? 'orange' : 'red'}`} dir="ltr">HTTP {response.status}</span>
            <pre className="code" dir="ltr">{JSON.stringify(response.body, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
