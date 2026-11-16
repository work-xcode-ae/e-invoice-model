// Billing for the manager: Model invoices & credit notes, bank transfers, overdue renewals, offers,
// manual / Enterprise invoices and Enterprise accounts (INV-01..INV-07, BIL-09..BIL-11).
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Eye, CheckCircle2, X, Plus, Landmark, AlertTriangle, Receipt, Building, Search, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { TaxDoc, Modal, E_STATUS_BADGE, downloadDocPdf } from '../../components/Brd';
import { allDocsWithCompany } from '../../services/modelDocs';
import { getOrders, confirmBankTransfer, cancelOrder, getPromos, savePromo, manualInvoice, createEnterpriseAccount } from '../../services/billing';
import { getUsers } from '../../services/api';
import { packages, formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime } from '../../utils/format';

const TABS = [['docs', 'Invoices and credit notes'], ['bank', 'Bank transfers'], ['overdue', 'Overdue renewals'], ['offers', 'Offers'], ['manual', 'Manual invoice'], ['enterprise', 'Enterprise account']];

export function AdminBilling() {
  const { t } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'docs';
  const edit = staffLevel('bank') === 'full';
  const counts = { bank: getOrders().filter((o) => o.status === 'Awaiting payment confirmation').length, overdue: getUsers().filter((u) => ['Past due', 'Suspended'].includes(u.subscription?.status)).length };
  return (
    <>
      <PageTitle title="Billing" sub="Model’s tax invoices and credit notes, bank transfers, overdue renewals and offers." />
      <div className="subtabs mb-2">{TABS.filter(([k]) => edit || ['docs', 'overdue'].includes(k)).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>{t(l)}{counts[k] ? <span className="subtab-count">{counts[k]}</span> : null}</button>)}</div>
      {tab === 'docs' && <Docs />}
      {tab === 'bank' && <Bank />}
      {tab === 'overdue' && <Overdue />}
      {tab === 'offers' && <Offers />}
      {tab === 'manual' && <Manual />}
      {tab === 'enterprise' && <Enterprise />}
    </>
  );
}

function Docs() {
  const { t, locale } = useLang();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState(null);
  const docs = allDocsWithCompany().filter((d) => (!type || d.type === type || d.kind === type) && (!q || [d.id, d.company, d.refInvoice].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))));
  return (
    <div className="card">
      <div className="flex gap-1 wrap mb-2">
        <div className="input-wrap" style={{ minWidth: 240 }}><Search size={16} /><input className="input" placeholder={t('Search number or company…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input input-sm" style={{ maxWidth: 200 }} value={type} onChange={(e) => setType(e.target.value)}><option value="">{t('All')}</option>{['Invoice', 'Credit note', 'Subscription', 'Renewal', 'Upgrade', 'Manual', 'Enterprise', 'Advertising'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Number')}</th><th>{t('Type')}</th><th>{t('Customer')}</th><th>{t('Date')}</th><th>{t('Excl. VAT')}</th><th>{t('VAT')}</th><th>{t('Total')}</th><th>{t('Status')}</th><th>{t('E-invoice')}</th><th /></tr></thead>
          <tbody>
            {docs.slice(0, 300).map((d) => (
              <tr key={d.id}>
                <td dir="ltr"><b>{d.id}</b>{d.refInvoice && <small className="muted" style={{ display: 'block' }}>→ {d.refInvoice}</small>}</td>
                <td>{t(d.type)} · <span className="muted">{t(d.kind)}</span></td>
                <td>{d.company}</td><td>{fmtDate(d.date, locale)}</td>
                <td dir="ltr">{formatMoney(d.subtotal)}</td><td dir="ltr">{formatMoney(d.vat)}</td><td dir="ltr"><b>{d.type === 'Credit note' ? '−' : ''}{formatMoney(d.total)}</b></td>
                <td><span className={`badge ${['Paid', 'Issued'].includes(d.status) ? 'green' : 'orange'}`}>{t(d.status)}</span></td>
                <td><span className={`badge ${E_STATUS_BADGE[d.einvoice?.status] || 'gray'}`}>{t(d.einvoice?.status || '—')}</span></td>
                <td><button className="icon-btn" onClick={() => setOpen(d)} aria-label={t('View')}><Eye size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Numbers run without gaps: one series for invoices, one for credit notes. Documents cannot be edited or deleted.')}</p>
      {open && <Modal title={open.id} icon={Receipt} wide onClose={() => setOpen(null)} footer={<button className="btn btn-primary" onClick={() => downloadDocPdf(open)}>{t('Download PDF')}</button>}><TaxDoc doc={open} /></Modal>}
    </div>
  );
}

function Bank() {
  const { t, locale } = useLang();
  const [ref, setRef] = useState({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const orders = getOrders();
  const confirm = async (o) => { setBusy(o.id); setErr(''); try { const r = await confirmBankTransfer(o.id, ref[o.id] || o.bankRef); setOk(t('Confirmed. Invoice {no} issued and the application submitted.', { no: r.invoice.id })); } catch (e) { setErr(e); } finally { setBusy(''); } };
  return (
    <div className="card">
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {ok && <div className="alert success mb-2"><CheckCircle2 size={16} /> {ok}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Order')}</th><th>{t('Customer')}</th><th>{t('Placed')}</th><th>{t('Amount')}</th><th>{t('Customer reference')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td dir="ltr"><b>{o.id}</b></td><td>{o.company}</td><td>{fmtDate(o.createdAt, locale)}</td><td dir="ltr"><b>{formatMoney(o.quote.total)}</b></td><td dir="ltr">{o.bankRef || '—'}</td>
                <td><span className={`badge ${o.status === 'Paid' ? 'green' : o.status === 'Cancelled' ? 'gray' : 'orange'}`}>{t(o.status)}</span></td>
                <td>{o.status === 'Awaiting payment confirmation' && <div className="flex gap-1"><input className="input input-sm" dir="ltr" style={{ maxWidth: 150 }} placeholder={t('Bank reference')} value={ref[o.id] ?? o.bankRef ?? ''} onChange={(e) => setRef({ ...ref, [o.id]: e.target.value })} /><button className="btn btn-primary btn-sm" disabled={busy === o.id} onClick={() => confirm(o)}>{busy === o.id ? <Loader2 size={14} className="spin" /> : <Landmark size={14} />} {t('Confirm received')}</button><button className="btn btn-outline btn-sm" onClick={() => cancelOrder(o.id, 'Cancelled by manager')}><X size={14} /></button></div>}</td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan="7" className="center muted" style={{ padding: 24 }}>{t('No bank transfers.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('A bank transfer is not a payment until it is confirmed here. The order stays “Awaiting payment confirmation” until then.')}</p>
    </div>
  );
}

function Overdue() {
  const { t, locale } = useLang();
  const list = getUsers().filter((u) => ['Past due', 'Suspended'].includes(u.subscription?.status));
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Customer')}</th><th>{t('Status')}</th><th>{t('Open invoice')}</th><th>{t('Grace ends')}</th><th>{t('Card')}</th><th /></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><b>{u.company?.name}</b></td><td><span className={`badge ${u.subscription.status === 'Suspended' ? 'red' : 'orange'}`}>{t(u.subscription.status)}</span></td>
                <td dir="ltr">{u.subscription.unpaidInvoice || '—'}</td><td>{fmtDate(u.subscription.graceUntil, locale)}</td>
                <td>{u.card ? `${u.card.brand} ••${u.card.last4} · ${u.card.exp}` : '—'}</td>
                <td><Link to={`/admin/onboarding?c=${u.id}`} className="link-btn">{t('Open')} →</Link></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="6" className="center muted" style={{ padding: 24 }}>{t('No overdue renewals.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('During the grace period sending continues and the customer gets a daily reminder. After it, the account is suspended and resumes as soon as the invoice is paid.')}</p>
    </div>
  );
}

const EMPTY_PROMO = { code: '', type: 'percent', value: 10, from: new Date().toISOString().slice(0, 10), to: '', maxUses: 50, packages: [], active: true, note: '' };
function Offers() {
  const { t } = useLang();
  const [f, setF] = useState(EMPTY_PROMO);
  const [err, setErr] = useState('');
  const save = () => { try { setErr(''); savePromo({ ...f, code: f.code.trim().toUpperCase(), value: Number(f.value), maxUses: Number(f.maxUses) }); setF(EMPTY_PROMO); } catch (e) { setErr(e); } };
  const label = (p) => (p.type === 'percent' ? `${p.value}%` : p.type === 'amount' ? formatMoney(p.value) : p.type === 'freeMonths' ? t('{n} free month(s)', { n: p.value }) : t('Setup fee waived'));
  return (
    <>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Code')}</th><th>{t('Discount')}</th><th>{t('Valid')}</th><th>{t('Used')}</th><th>{t('Packages')}</th><th>{t('Active')}</th><th /></tr></thead>
            <tbody>{getPromos().map((p) => <tr key={p.code}><td dir="ltr"><b>{p.code}</b><small className="muted" style={{ display: 'block' }}>{p.note}</small></td><td>{label(p)}</td><td>{p.from} → {p.to || '∞'}</td><td dir="ltr">{p.used} / {p.maxUses || '∞'}</td><td>{p.packages?.length ? p.packages.join(', ') : t('All')}</td><td><input type="checkbox" checked={p.active} onChange={(e) => savePromo({ ...p, active: e.target.checked })} /></td><td><button className="link-btn" onClick={() => setF(p)}>{t('Edit')}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="card mt-2">
        <h3>{f.used !== undefined ? t('Edit offer') : t('New offer')}</h3>
        {err && <div className="alert error mb-2">{errText(t, err)}</div>}
        <div className="form-grid">
          <div className="field"><label>{t('Code')}</label><input className="input" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div className="field"><label>{t('Type')}</label><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">{t('Percentage')}</option><option value="amount">{t('Amount')}</option><option value="freeMonths">{t('Free months')}</option><option value="setupWaiver">{t('Setup fee waived')}</option></select></div>
          <div className="field"><label>{t('Value')}</label><input className="input" type="number" dir="ltr" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} disabled={f.type === 'setupWaiver'} /></div>
          <div className="field"><label>{t('Maximum uses')}</label><input className="input" type="number" dir="ltr" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></div>
          <div className="field"><label>{t('From')}</label><input className="input" type="date" dir="ltr" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
          <div className="field"><label>{t('To')}</label><input className="input" type="date" dir="ltr" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
          <div className="field full"><label>{t('Packages (none = all)')}</label><div className="chip-group">{packages.filter((p) => !p.custom).map((p) => <button type="button" key={p.id} className={`chip ${f.packages.includes(p.id) ? 'on' : ''}`} onClick={() => setF({ ...f, packages: f.packages.includes(p.id) ? f.packages.filter((x) => x !== p.id) : [...f.packages, p.id] })}>{t(p.name)}</button>)}</div></div>
          <div className="field full"><label>{t('Note')}</label><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary mt-2" onClick={save}><Plus size={15} /> {t('Save offer')}</button>
        <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Only one discount applies per invoice, shown as its own line. A special discount for one customer is set from the customer’s file (manager only).')}</p>
      </div>
    </>
  );
}

function Manual() {
  const { t } = useLang();
  const customers = getUsers().filter((u) => u.role !== 'SuperAdmin' && u.company);
  const [f, setF] = useState({ customerId: '', contractRef: '', paymentRef: '', method: 'Bank transfer', paid: false, lines: [{ text: '', amount: '' }] });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(null);
  const setLine = (i, k, v) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
  const save = () => {
    try {
      setErr('');
      const lines = f.lines.filter((l) => l.text && Number(l.amount)).map((l) => ({ desc: l.text, amount: Number(l.amount), kind: 'manual' }));
      setOk(manualInvoice({ customerId: f.customerId, lines, contractRef: f.contractRef, paymentRef: f.paymentRef, method: f.method, paid: f.paid }));
      setF({ ...f, lines: [{ text: '', amount: '' }], contractRef: '', paymentRef: '' });
    } catch (e) { setErr(e); }
  };
  return (
    <div className="card">
      <h3>{t('Manual invoice')}</h3>
      <p className="muted">{t('For Enterprise contracts and other agreed amounts. Same number series as every other invoice.')}</p>
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {ok && <div className="alert success mb-2"><CheckCircle2 size={16} /> {t('Invoice {no} issued and emailed.', { no: ok.id })}</div>}
      <div className="form-grid">
        <div className="field"><label>{t('Customer')}</label><select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">—</option>{customers.map((u) => <option key={u.id} value={u.id}>{u.company.name}</option>)}</select></div>
        <div className="field"><label>{t('Contract reference')}</label><input className="input" dir="ltr" value={f.contractRef} onChange={(e) => setF({ ...f, contractRef: e.target.value })} /></div>
        <div className="field"><label>{t('Payment method')}</label><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option>Bank transfer</option><option>Card</option></select></div>
        <div className="field"><label>{t('Payment reference')}</label><input className="input" dir="ltr" value={f.paymentRef} onChange={(e) => setF({ ...f, paymentRef: e.target.value })} /></div>
        <label className="checkbox full"><input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> {t('Already paid')}</label>
      </div>
      <h4 className="mt-2">{t('Lines (excl. VAT)')}</h4>
      {f.lines.map((l, i) => <div key={i} className="flex gap-1 mb-1"><input className="input" placeholder={t('Description')} value={l.text} onChange={(e) => setLine(i, 'text', e.target.value)} /><input className="input" type="number" dir="ltr" style={{ maxWidth: 160 }} placeholder="0.00" value={l.amount} onChange={(e) => setLine(i, 'amount', e.target.value)} /><button className="icon-btn danger" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} aria-label={t('Remove')}><Trash2 size={15} /></button></div>)}
      <div className="flex gap-1"><button className="btn btn-outline btn-sm" onClick={() => setF({ ...f, lines: [...f.lines, { text: '', amount: '' }] })}><Plus size={14} /> {t('Add line')}</button><button className="btn btn-primary btn-sm" disabled={!f.customerId} onClick={save}><Receipt size={14} /> {t('Issue invoice')}</button></div>
    </div>
  );
}

function Enterprise() {
  const { t } = useLang();
  const [f, setF] = useState({ company: '', ownerName: '', email: '', phone: '', monthlyPrice: '', annualPrice: '', quota: '', users: 20, entities: 3, overagePrice: '0.5', contractRef: '', months: 12 });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => { setBusy(true); setErr(''); try { setOk(await createEnterpriseAccount(f)); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <div className="card">
      <h3><Building size={18} /> {t('Create an Enterprise account')}</h3>
      <p className="muted">{t('After the quote and the contract signed outside the platform: a custom package for this customer, several entities, no automatic payment.')}</p>
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {ok && <div className="alert success mb-2"><CheckCircle2 size={16} /> {t('Account created. Temporary password: {pw}. The customer now uploads documents; send the first invoice from “Manual invoice”.', { pw: ok.tempPassword })}</div>}
      <div className="form-grid">
        {[['company', 'Company'], ['ownerName', 'Contact name'], ['email', 'Email'], ['phone', 'Mobile'], ['contractRef', 'Contract reference'], ['monthlyPrice', 'Monthly price'], ['annualPrice', 'Annual price'], ['quota', 'Documents / month'], ['overagePrice', 'Price per extra document'], ['users', 'Users'], ['entities', 'Entities']].map(([k, l]) => (
          <div className="field" key={k}><label>{t(l)}</label><input className="input" dir={['company', 'ownerName'].includes(k) ? undefined : 'ltr'} type={['monthlyPrice', 'annualPrice', 'quota', 'overagePrice', 'users', 'entities'].includes(k) ? 'number' : 'text'} value={f[k]} onChange={set(k)} /></div>
        ))}
        <div className="field"><label>{t('Billing')}</label><select className="input" value={f.months} onChange={set('months')}><option value={12}>{t('Annual')}</option><option value={1}>{t('Monthly')}</option></select></div>
      </div>
      <button className="btn btn-primary mt-2" disabled={busy} onClick={save}>{busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {t('Create account')}</button>
      {Number(f.annualPrice) > Number(f.monthlyPrice) * 12 && <div className="alert warn mt-2"><AlertTriangle size={16} /> {t('The annual price is more than 12 monthly payments.')}</div>}
    </div>
  );
}
