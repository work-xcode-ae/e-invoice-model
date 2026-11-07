import { useMemo, useState } from 'react';
import {
  FileText, PenLine, FileSpreadsheet, Code2, Search, X, RotateCcw, Ban, Clock, Loader, Send, CheckCircle2,
  XCircle, RefreshCcw, Lock, Server, Gauge,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { retryInvoice, cancelInvoice, ACTIVE_STATUSES, MAX_RETRIES, getSettings } from '../../services/invoices';
import { invoicesLeft } from '../../services/notifications';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime, STATUS_BADGE } from '../../utils/format';
import { ManualInvoice, ExcelUpload, ApiPanel } from './InvoiceInputs';
import QvaliaPayload from './QvaliaPayload';

const STATUS_ICON = { Queued: Clock, Processing: Loader, 'Sent to White Label': Send, Retrying: RefreshCcw, Success: CheckCircle2, Failed: XCircle, Cancelled: Ban };
const FILTERS = ['All', 'In progress', 'Success', 'Failed', 'Cancelled'];

export function StatusBadge({ status }) {
  const { t } = useLang();
  const Icon = STATUS_ICON[status] || Clock;
  const spinning = status === 'Processing' || status === 'Sent to White Label';
  return <span className={`badge ${STATUS_BADGE[status] || 'gray'}`}><Icon size={12} className={spinning ? 'spin' : ''} /> {t(status)}</span>;
}

export function InvoiceDetail({ inv, onClose, canAct = true, userId }) {
  const { t, locale } = useLang();
  if (!inv) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={inv.id}>
        <div className="drawer-head">
          <div>
            <span className="muted" style={{ fontSize: 13 }}>{t('Invoice')}</span>
            <h3 className="mb-0" dir="ltr" style={{ textAlign: 'start' }}>{inv.id}</h3>
          </div>
          <div className="flex items-center gap-1"><StatusBadge status={inv.status} /><button className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button></div>
        </div>

        <div className="kv-grid">
          <div><span>{t('Customer')}</span><b>{inv.customerName}</b></div>
          <div><span>{t('Issue date')}</span><b>{fmtDate(inv.issueDate, locale)}</b></div>
          <div><span>{t('Source')}</span><b>{t(inv.source)}</b></div>
          <div><span>{t('Queue ID')}</span><b dir="ltr">{inv.queueId}</b></div>
          <div><span>{t('Retry count')}</span><b dir="ltr">{inv.retryCount} / {MAX_RETRIES}</b></div>
          <div><span>{t('Qvalia integration ID')}</span><b dir="ltr" style={{ fontSize: 12.5 }}>{inv.wlInvoiceId || '—'}</b></div>
          {inv.dueDate && <div><span>{t('Due date')}</span><b>{fmtDate(inv.dueDate, locale)}</b></div>}
          {inv.buyerReference && <div><span>{t('Buyer reference')}</span><b dir="ltr">{inv.buyerReference}</b></div>}
          {inv.externalRef && <div><span>{t('Your reference')}</span><b dir="ltr">{inv.externalRef}</b></div>}
          {inv.lastError && <div className="full"><span>{t('Last error')}</span><b className="text-danger" dir="ltr">{inv.lastError}</b></div>}
        </div>

        <h4 className="mt-2">{t('Status timeline')}</h4>
        <ol className="timeline">
          {inv.history.map((h, i) => {
            const Icon = STATUS_ICON[h.status] || Clock;
            return (
              <li key={i} className={`tl-${STATUS_BADGE[h.status] || 'gray'}`}>
                <span className="tl-dot"><Icon size={13} /></span>
                <div><b>{t(h.status)}</b> <small className="muted">{fmtDateTime(h.at, locale)}</small>{h.note && <p>{t(h.note, h.vars)}</p>}</div>
              </li>
            );
          })}
        </ol>

        <h4 className="mt-2">{t('Items')}</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Item')}</th><th>{t('Qty')}</th><th>{t('Price')}</th><th>{t('VAT')}</th><th>{t('Amount')}</th></tr></thead>
            <tbody>
              {inv.items.map((l, i) => <tr key={i}><td>{l.name}{l.description && <div className="muted" style={{ fontSize: 12 }}>{l.description}</div>}</td><td dir="ltr">{l.qty} {l.unitCode || ''}</td><td>{formatMoney(l.price)}</td><td dir="ltr">{l.taxCategory || ''} {l.vatRate}%</td><td>{formatMoney(l.net)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="inv-totals mt-1" style={{ marginInlineStart: 'auto' }}>
          <div className="summary-row"><span>{t('Subtotal')}</span><span>{formatMoney(inv.subtotal)}</span></div>
          {inv.discount > 0 && <div className="summary-row"><span>{t('Discount')}</span><span>−{formatMoney(inv.discount)}</span></div>}
          <div className="summary-row"><span>{t('VAT')}</span><span>{formatMoney(inv.vat)}</span></div>
          <div className="summary-row total"><span>{t('Total')}</span><span>{formatMoney(inv.total)}</span></div>
        </div>

        <QvaliaPayload inv={inv} userId={userId} />

        {canAct && (
          <div className="flex gap-1 mt-2">
            {['Failed', 'Cancelled'].includes(inv.status) && <button className="btn btn-primary btn-sm" onClick={() => retryInvoice(userId, inv.id)}><RotateCcw size={15} /> {t('Send again')}</button>}
            {['Queued', 'Retrying'].includes(inv.status) && <button className="btn btn-outline btn-sm" onClick={() => cancelInvoice(userId, inv.id)}><Ban size={15} /> {t('Cancel')}</button>}
          </div>
        )}
      </aside>
    </div>
  );
}

function InvoiceList({ setMode }) {
  const { user, can } = useAuth();
  const { t, locale } = useLang();
  const [filter, setFilter] = useState('All');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const all = user.invoices || [];

  const list = useMemo(() => {
    let l = all;
    if (filter === 'In progress') l = l.filter((i) => ACTIVE_STATUSES.includes(i.status));
    else if (filter !== 'All') l = l.filter((i) => i.status === filter);
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((i) => [i.id, i.customerName, i.queueId, i.wlInvoiceId, i.externalRef].some((v) => v && String(v).toLowerCase().includes(s)));
    return l;
  }, [all, filter, q]);
  const counts = {
    All: all.length,
    'In progress': all.filter((i) => ACTIVE_STATUSES.includes(i.status)).length,
    Success: all.filter((i) => i.status === 'Success').length,
    Failed: all.filter((i) => i.status === 'Failed').length,
    Cancelled: all.filter((i) => i.status === 'Cancelled').length,
  };
  const open = all.find((i) => i.id === openId);

  return (
    <>
      <div className="flex between items-center wrap gap-1 mb-2">
        <div className="chip-group">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{t(f)} <span className="subtab-count">{counts[f]}</span></button>
          ))}
        </div>
        <div className="input-wrap" style={{ minWidth: 220 }}>
          <Search size={16} />
          <input className="input" placeholder={t('Search invoice, customer, queue ID…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="table-click">
          <thead><tr><th>{t('Invoice')}</th><th>{t('Customer')}</th><th>{t('Date')}</th><th>{t('Source')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('Retries')}</th></tr></thead>
          <tbody>
            {list.slice(0, 100).map((i) => (
              <tr key={i.id} onClick={() => setOpenId(i.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(i.id)}>
                <td><strong dir="ltr">{i.id}</strong></td>
                <td>{i.customerName}</td>
                <td className="muted">{fmtDate(i.createdAt, locale)}</td>
                <td>{t(i.source)}</td>
                <td>{formatMoney(i.total)}</td>
                <td><StatusBadge status={i.status} /></td>
                <td dir="ltr" className="muted">{i.retryCount ? `${i.retryCount}/${MAX_RETRIES}` : '—'}</td>
              </tr>
            ))}
            {!list.length && (
              <tr><td colSpan="7" className="center muted" style={{ padding: 32 }}>
                {all.length || !can('invoices.create') ? t(all.length ? 'No results.' : 'No invoices yet.') : <>{t('No invoices yet.')} <button className="link-btn" onClick={() => setMode('manual')}>{t('Create your first invoice')} →</button></>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {list.length > 100 && <p className="muted mt-1" style={{ fontSize: 13 }}>{t('Showing the latest 100 invoices.')}</p>}
      <InvoiceDetail inv={open} onClose={() => setOpenId(null)} userId={user.id} canAct={can('invoices.create')} />
    </>
  );
}

export default function Invoices({ setTab }) {
  const { user, can } = useAuth();
  const { t } = useLang();
  const [mode, setMode] = useState('list');
  const all = user.invoices || [];
  const inflight = all.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const locked = user.subscription?.locked;
  const settings = getSettings();

  const MODES = [
    { id: 'list', icon: FileText, label: 'All invoices' },
    { id: 'manual', icon: PenLine, label: 'Manual entry', perm: 'invoices.create' },
    { id: 'excel', icon: FileSpreadsheet, label: 'Excel upload', perm: 'invoices.create' },
    { id: 'api', icon: Code2, label: 'API / SDK', perm: 'api' },
  ].filter((m) => !m.perm || can(m.perm));

  return (
    <div className="card">
      <div className="flex between items-center wrap gap-2 mb-2">
        <div>
          <h3 className="mb-0">{t('Invoices')}</h3>
          <p className="muted mb-0" style={{ fontSize: 14 }}>{t('Create, upload or send invoices by API. Each one is validated, queued and delivered to White Label.')}</p>
        </div>
        <div className="queue-strip">
          <span><Gauge size={15} /> {t('{n} invoices left', { n: invoicesLeft(user).toLocaleString() })}</span>
          <span><Server size={15} /> {t('{n} in queue', { n: inflight.length })}</span>
        </div>
      </div>

      {locked && <div className="alert error mb-2"><Lock size={18} /> {t('Your package is locked after a refund. New invoices are not allowed.')}</div>}

      <div className="subtabs">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)} disabled={locked && m.id !== 'list'}>
            <m.icon size={16} /> {t(m.label)}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {mode === 'list' && <InvoiceList setMode={setMode} />}
        {mode === 'manual' && <ManualInvoice onDone={(next) => (next === 'master' ? setTab('customers') : setMode('list'))} />}
        {mode === 'excel' && <ExcelUpload />}
        {mode === 'api' && <ApiPanel />}
      </div>

      <p className="muted mt-2" style={{ fontSize: 12.5 }}>
        {t('Demo: the background process runs every {s} seconds here (every 5–10 minutes in production), retries failed sends up to {max} times and never sends the same invoice twice.', { s: Math.round(settings.phaseMs / 1000), max: MAX_RETRIES })}
      </p>
    </div>
  );
}
