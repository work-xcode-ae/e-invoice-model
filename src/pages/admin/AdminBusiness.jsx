import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  TrendingUp, Wallet, Repeat, UserPlus, CheckCircle2, RefreshCw, LifeBuoy, BatteryLow, Download, Send, X, Pencil, Save,
  FileSpreadsheet, Building2, Package as PackageIcon, BarChart3, Megaphone, Search, AlertTriangle, CalendarClock, Receipt, Undo2, Power,
  MessageSquare, RotateCcw, MoreHorizontal, UserCheck, Clock, PlayCircle, Mail, Trash2,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { getUserById } from '../../services/api';
import { setCompanyActive, grantInvoices } from '../../services/admin';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle, Badge } from './Admin';
import { adminOverview, salesReport, companyStats, platformReport, plByPeriod, allInvoiceRows, thisMonth, DATE_PRESETS, rangeKey, RANGES, PAYMENT_TYPES, exportSheets, saveFinance, getFinance, DEFAULT_FINANCE } from '../../services/reports';
import ReportGrid from '../../components/ReportGrid';
import { getTickets, ticketStats, replyTicket, setTicket, updateTickets, deleteTickets, TICKET_STATUSES, TICKET_PRIORITIES, TICKET_CATEGORIES, TICKET_TEAMS } from '../../services/support';
import { AUDIENCES, LINKS, recipients, sendBroadcast, getBroadcasts } from '../../services/broadcasts';
import { StackedBars, Legend, HBars, Donut, Stat, RangePicker, DateRangeFilter, rangeText } from '../../components/AdminCharts';
import { formatMoney, packages } from '../../data/packages';
import { fmtDate, fmtDateTime, timeAgo } from '../../utils/format';

const PKG_COLOR = { basic: '#8fd3e6', standard: '#3DB4D2', platinum: '#092F58' };
const REFUND = { id: 'Refund', color: '#ef4444', label: 'Refunds' };
const money0 = (v) => formatMoney(Math.round(v));

/** "120 left of 500" cell used on the overview and the companies page. */
export function LeftCell({ c }) {
  const { t } = useLang();
  if (!c.limit) return <span className="muted">—</span>;
  const left = Math.max(0, c.limit - c.used);
  const pct = (left / c.limit) * 100;
  const color = pct <= 10 ? '#ef4444' : pct <= 20 ? '#f59e0b' : '#16a34a';
  return (
    <div className="left-cell">
      <div className="lc-num" dir="ltr">{left.toLocaleString()} <small>/ {c.limit.toLocaleString()} · {Math.round(pct)}%</small></div>
      <span className="ub" aria-label={t('{n} invoices left', { n: left })}><i style={{ width: `${pct}%`, background: color }} /></span>
    </div>
  );
}

/* ====================== Business overview (system admin home) ====================== */
export function AdminOverview() {
  const { t, locale } = useLang();
  useDbVersion();
  const navigate = useNavigate();
  const o = adminOverview();
  const tk = ticketStats();
  const tickets = getTickets().filter((x) => x.status !== 'Resolved').slice(0, 4);
  const m = o.month;
  const yearly = salesReport('12m');

  return (
    <>
      <PageTitle title="Business overview" sub="Sales, profit, packages, customers, support and invoice sync at a glance.">
        <span className="muted" style={{ fontSize: 14 }}>{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </PageTitle>

      <div className="stat-grid">
        <Stat icon={TrendingUp} tone="green" label="Profit · last 30 days" value={money0(m.profit)} sub={t('Margin {n}%', { n: m.margin.toFixed(0) })} onClick={() => navigate('/admin/sales')} />
        <Stat icon={Wallet} label="Sales · last 30 days" value={money0(m.gross)} trend={m.trend} sub={t('{n} payments', { n: m.count })} onClick={() => navigate('/admin/sales')} />
        <Stat icon={Repeat} tone="purple" label="Monthly recurring revenue" value={money0(o.month.mrr)} sub={t('{n} active subscriptions', { n: o.active })} onClick={() => navigate('/admin/packages')} />
        <Stat icon={UserPlus} tone="orange" label="New customers this month" value={o.newThisMonth} sub={t('{n} companies in total', { n: o.companies })} onClick={() => navigate('/admin/companies')} />
        <Stat icon={CheckCircle2} tone="green" label="Invoices passed today" value={o.passedToday.toLocaleString()} sub={t('{n} failed today', { n: o.failedToday })} onClick={() => navigate('/admin/monitoring')} />
        <Stat icon={RefreshCw} tone={o.pending ? 'orange' : ''} label="Pending to sync" value={o.pending.toLocaleString()} sub={[o.oldestPending ? t('Oldest waiting {ago}', { ago: timeAgo(o.oldestPending.createdAt, t) }) : t('Nothing waiting'), o.failed ? t('{n} failed to resend', { n: o.failed }) : ''].filter(Boolean).join(' · ')} onClick={() => navigate('/admin/queue')} />
        <Stat icon={LifeBuoy} tone={tk.urgent ? 'red' : ''} label="Open support tickets" value={tk.open} sub={t('{u} urgent · {n} without reply', { u: tk.urgent, n: tk.unanswered })} onClick={() => navigate('/admin/support')} />
        <Stat icon={BatteryLow} tone={o.lowBalance ? 'red' : ''} label="Companies low on invoices" value={o.lowBalance} sub={t('{n} renewals in 30 days', { n: o.expiringSoon })} onClick={() => navigate('/admin/companies?f=low')} />
      </div>

      <div className="grid-2 mt-2">
        <div className="card">
          <div className="card-head"><div><h3>{t('Sales and profit')}</h3><small>{t('Last 12 months')}</small></div><Legend keys={[...PAYMENT_TYPES, { id: 'p', color: '#16a34a', label: 'Revenue without VAT' }]} /></div>
          <StackedBars data={yearly.profitSeries} keys={PAYMENT_TYPES} unit="month" money line={{ key: 'revenue', color: '#16a34a', label: 'Revenue without VAT' }} />
        </div>
        <div className="card">
          <div className="card-head"><div><h3>{t('New customers')}</h3><small>{t('Registrations per month')}</small></div><Link to="/admin/companies" className="link-btn">{t('View all')} →</Link></div>
          <HBars rows={o.newSeries.map((x) => ({ label: new Date(x.date).toLocaleDateString(locale, { month: 'long', year: 'numeric' }), value: x.value }))} color="#3DB4D2" />
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-head"><div><h3>{t('Packages')}</h3><small>{t('Active subscribers, monthly recurring revenue and sales in the last 30 days')}</small></div><Link to="/admin/packages" className="link-btn">{t('Manage prices')} →</Link></div>
        <div className="pkg-stats">
          {o.packages.map((p) => (
            <div className="pkg-stat" key={p.id} style={{ borderTop: `4px solid ${PKG_COLOR[p.id]}` }}>
              <div className="ps-top"><b>{t(p.name)}</b><span className="muted" dir="ltr">{formatMoney(p.price)} / {t('month')}</span></div>
              <div className="ps-num" dir="ltr">{p.active}</div>
              <span className="muted" style={{ fontSize: 13 }}>{t('active subscribers')}</span>
              <div className="ps-row"><span>{t('MRR')}</span><b dir="ltr">{money0(p.mrr)}</b></div>
              <div className="ps-row"><span>{t('Sales · 30 days')}</span><b dir="ltr">{money0(p.revenue)}</b></div>
              <div className="ps-row"><span>{t('Expired / locked')}</span><b dir="ltr">{p.expired}</b></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 mt-2">
        <div className="card">
          <div className="card-head"><div><h3>{t('Invoices left per company')}</h3><small>{t('Lowest balance first')}</small></div><Link to="/admin/companies" className="link-btn">{t('View all')} →</Link></div>
          <div className="table-wrap">
            <table className="table-click">
              <thead><tr><th>{t('Company')}</th><th>{t('Package')}</th><th>{t('Left in package')}</th><th>{t('Ends')}</th></tr></thead>
              <tbody>
                {o.balances.filter((c) => c.status === 'Active').slice(0, 7).map((c) => (
                  <tr key={c.userId} onClick={() => navigate(`/admin/companies?open=${c.userId}`)}>
                    <td><strong>{c.company}</strong></td>
                    <td>{t(c.packageName)} {c.status !== 'Active' && <Badge status={c.status} />}</td>
                    <td><LeftCell c={c} /></td>
                    <td className="muted">{fmtDate(c.endDate, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <div className="card">
            <div className="card-head"><h3>{t('Invoice sync')}</h3><Link to="/admin/queue" className="link-btn">{t('Open queue')} →</Link></div>
            <HBars rows={[...o.pendingByStatus, { label: 'Failed', value: o.failed, color: '#ef4444' }]} translate color="#f59e0b" max={Math.max(1, o.pending, o.failed)} />
          </div>
          <div className="card">
            <div className="card-head"><h3>{t('Support')}</h3><Link to="/admin/support" className="link-btn">{t('All tickets')} →</Link></div>
            <ul className="activity-list">
              {tickets.map((x) => (
                <li key={x.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/support?open=${x.id}`)}>
                  <span className={`act-dot ${x.priority === 'Urgent' || x.priority === 'High' ? 't-error' : 't-activity'}`} />
                  <div><b>{x.subject}</b><small>{x.company || x.email} · {t(`${x.status}|status`)}</small></div>
                  <time className="muted">{timeAgo(x.createdAt, t)}</time>
                </li>
              ))}
              {!tickets.length && <li className="muted">{t('No open tickets.')}</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-head"><div><h3>{t('Renewals due in the next 30 days')}</h3><small>{t('Expected revenue {amount}', { amount: money0(m.expected30) })}</small></div>
          <Link to="/admin/notifications" state={{ audience: 'expiring' }} className="btn btn-outline btn-sm"><Megaphone size={15} /> {t('Remind them')}</Link></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Company')}</th><th>{t('Package')}</th><th>{t('Ends')}</th><th>{t('Left in package')}</th><th>{t('Expected')}</th></tr></thead>
            <tbody>
              {m.renewals.slice(0, 8).map((c) => (
                <tr key={c.userId}><td><strong>{c.company}</strong></td><td>{t(c.packageName)}</td><td>{fmtDate(c.endDate, locale)}</td><td><LeftCell c={c} /></td><td dir="ltr">{formatMoney(c.expected)}</td></tr>
              ))}
              {!m.renewals.length && <tr><td colSpan="5" className="muted center">{t('No renewals due.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ====================== Sales & profit ====================== */
function CostsForm({ onDone }) {
  const { t } = useLang();
  const [f, setF] = useState(getFinance());
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card-soft mt-1">
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field"><label>{t('Peppol delivery cost per invoice (AED)')}</label><input className="input" dir="ltr" type="number" step="0.01" value={f.deliveryCost} onChange={set('deliveryCost')} /></div>
        <div className="field"><label>{t('Payment gateway fee (%)')}</label><input className="input" dir="ltr" type="number" step="0.1" value={f.gatewayPct} onChange={set('gatewayPct')} /></div>
        <div className="field"><label>{t('Gateway fixed fee per payment (AED)')}</label><input className="input" dir="ltr" type="number" step="0.1" value={f.gatewayFixed} onChange={set('gatewayFixed')} /></div>
        <div className="field"><label>{t('Fixed running costs per month (AED)')}</label><input className="input" dir="ltr" type="number" value={f.monthlyFixed} onChange={set('monthlyFixed')} /></div>
      </div>
      <div className="flex gap-1">
        <button className="btn btn-primary btn-sm" onClick={() => { saveFinance(f); onDone(); }}><Save size={15} /> {t('Save costs')}</button>
        <button className="btn btn-outline btn-sm" onClick={() => setF(DEFAULT_FINANCE)}><Undo2 size={15} /> {t('Defaults')}</button>
      </div>
    </div>
  );
}

export function AdminSales() {
  const { t, locale } = useLang();
  useDbVersion();
  const [range, setRange] = useState(thisMonth);
  const [editCosts, setEditCosts] = useState(false);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(15);
  const s = salesReport(range);
  const pays = s.payments.filter((p) => !q || [p.company, p.id, p.type, p.packageName].some((v) => String(v).toLowerCase().includes(q.toLowerCase())));
  const rangeLabel = rangeText(range, locale);

  const exportIt = () => exportSheets(`MEI-sales-${rangeKey(range)}.xlsx`, [
    ['Summary', [['Metric', 'Value (AED)'], ['Sales incl. VAT', s.gross], ['VAT', s.vat], ['Revenue without VAT', +s.revenueExVat.toFixed(2)], ['Refunds (without VAT)', +s.refundsExVat.toFixed(2)], ['Peppol delivery costs', +s.deliveryCost.toFixed(2)], ['Payment gateway fees', +s.gatewayFees.toFixed(2)], ['Fixed running costs', s.fixedCosts], ['Profit', +s.profit.toFixed(2)], ['Margin %', +s.margin.toFixed(1)], ['MRR', s.mrr], ['Active subscriptions', s.active]]],
    ['Payments', [['Date', 'Payment ID', 'Company', 'Type', 'Package', 'Amount incl. VAT', 'Status'], ...s.payments.map((p) => [p.date.slice(0, 10), p.id, p.company, p.type, p.packageName, p.total, p.status])]],
    ['By period', [['Period', ...PAYMENT_TYPES.map((x) => x.id), 'Refunds'], ...s.series.map((x) => [x.key, ...PAYMENT_TYPES.map((k) => x.parts[k.id]), x.parts.Refund])]],
    ['By package', [['Package', 'Monthly price', 'Active subscribers', 'Sales'], ...s.byPackage.map((p) => [p.name, p.price, p.active, p.revenue])]],
  ]);

  return (
    <>
      <PageTitle title="Sales & profit" sub="Revenue from packages, renewals, upgrades and add-ons, and what is left after costs.">
        <div className="flex gap-1 wrap items-center"><DateRangeFilter value={range} onChange={setRange} presets={DATE_PRESETS} /><button className="btn btn-outline btn-sm" onClick={exportIt}><Download size={15} /> {t('Export')}</button></div>
      </PageTitle>

      <div className="stat-grid">
        <Stat icon={Wallet} label="Sales incl. VAT" value={money0(s.gross)} trend={s.trend} sub={t('{n} payments · {range}', { n: s.count, range: rangeLabel })} />
        <Stat icon={TrendingUp} tone="green" label="Profit" value={money0(s.profit)} sub={t('Margin {n}%', { n: s.margin.toFixed(0) })} />
        <Stat icon={Repeat} tone="purple" label="Monthly recurring revenue" value={money0(s.mrr)} sub={t('ARR {v} · per company {a}', { v: money0(s.arr), a: money0(s.arpa) })} />
        <Stat icon={UserPlus} tone="orange" label="New subscriptions" value={s.newCustomers} sub={t('{n} expired or refunded companies', { n: s.churned })} />
      </div>

      <div className="grid-2 mt-2">
        <div className="card">
          <div className="card-head"><div><h3>{t('Sales by type')}</h3><small>{rangeLabel}</small></div><Legend keys={[...PAYMENT_TYPES, REFUND]} /></div>
          <StackedBars data={s.series} keys={[...PAYMENT_TYPES, REFUND]} unit={s.unit} money />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Profit and loss')}</h3><button className="link-btn" onClick={() => setEditCosts((v) => !v)}><Pencil size={14} /> {t('Edit costs')}</button></div>
          <table className="pl-table">
            <tbody>
              <tr><td>{t('Sales incl. VAT')}</td><td dir="ltr">{formatMoney(s.gross.toFixed(2))}</td></tr>
              <tr className="minus"><td>{t('VAT collected for FTA')}</td><td dir="ltr">−{formatMoney(s.vat)}</td></tr>
              <tr><td><b>{t('Revenue without VAT')}</b></td><td dir="ltr"><b>{formatMoney(s.revenueExVat.toFixed(2))}</b></td></tr>
              <tr className="minus"><td>{t('Refunds')}</td><td dir="ltr">−{formatMoney(s.refundsExVat.toFixed(2))}</td></tr>
              <tr className="minus"><td>{t('Peppol delivery ({n} invoices × {c})', { n: s.delivered.toLocaleString(), c: formatMoney(s.finance.deliveryCost) })}</td><td dir="ltr">−{formatMoney(s.deliveryCost.toFixed(2))}</td></tr>
              <tr className="minus"><td>{t('Payment gateway fees')}</td><td dir="ltr">−{formatMoney(s.gatewayFees.toFixed(2))}</td></tr>
              <tr className="minus"><td>{t('Fixed running costs')}</td><td dir="ltr">−{formatMoney(s.fixedCosts)}</td></tr>
              <tr className={`total ${s.profit >= 0 ? 'pos' : ''}`}><td>{t('Profit')}</td><td dir="ltr">{formatMoney(s.profit.toFixed(2))}</td></tr>
            </tbody>
          </table>
          {editCosts && <CostsForm onDone={() => setEditCosts(false)} />}
        </div>
      </div>

      <div className="grid-3 mt-2">
        <div className="card">
          <div className="card-head"><h3>{t('Sales by package')}</h3></div>
          <Donut money parts={s.byPackage.map((p) => ({ label: p.name, value: p.revenue, color: PKG_COLOR[p.id] }))} center={{ value: money0(s.gross), label: 'Total' }} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Sales by type')}</h3></div>
          <HBars money translate rows={s.byType.map((x) => ({ label: x.label, value: x.value, color: x.color, sub: t('{n} payments', { n: x.count }) }))} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Top paying companies')}</h3></div>
          <HBars money rows={s.top.map((c) => ({ label: c.company, value: c.rangeRevenue }))} color="#092F58" />
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-head">
          <div><h3>{t('Payments')}</h3><small>{rangeLabel}</small></div>
          <div className="input-wrap" style={{ minWidth: 240 }}><Search size={16} /><input className="input" placeholder={t('Search company, payment ID…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Date')}</th><th>{t('Company')}</th><th>{t('Type')}</th><th>{t('Package')}</th><th>{t('Payment ID')}</th><th>{t('Amount')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>
              {pays.slice(0, shown).map((p) => (
                <tr key={p.id + p.userId}>
                  <td className="muted">{fmtDate(p.date, locale)}</td><td><strong>{p.company}</strong></td><td>{t(p.type)}</td><td>{t(p.packageName)}</td>
                  <td dir="ltr" className="muted" style={{ fontSize: 12.5 }}>{p.id}</td>
                  <td dir="ltr" className={p.total < 0 ? 'text-danger' : ''}>{formatMoney(p.total)}</td><td><Badge status={p.status} /></td>
                </tr>
              ))}
              {!pays.length && <tr><td colSpan="7" className="center muted">{t('No payments in this period.')}</td></tr>}
            </tbody>
          </table>
        </div>
        {pays.length > shown && (
          <div className="flex between items-center mt-1 wrap gap-1">
            <span className="muted" style={{ fontSize: 13 }}>{t('Showing {a} of {n}', { a: shown, n: pays.length })}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setShown((n) => n + 30)}>{t('Show more')}</button>
          </div>
        )}
      </div>
    </>
  );
}

/* ====================== Support tickets ====================== */
const FIELD_LABEL = { status: 'Status', priority: 'Priority', assignee: 'Assigned', category: 'Category' };

/** "⋯" menu for a table row. Rendered in <body> with fixed position so the table's scroll box does not cut it off. */
function RowMenu({ label, children }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const close = () => setPos(null);
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return null; // button scrolled away
    const rtl = document.documentElement.dir === 'rtl';
    const W = 230;
    const H = menu.current?.offsetHeight || 460;
    const left = rtl ? Math.min(r.left, window.innerWidth - W - 8) : Math.max(8, r.right - W);
    const top = r.bottom + H + 8 > window.innerHeight ? Math.max(8, r.top - H - 4) : r.bottom + 4;
    return { left, top };
  };
  useEffect(() => {
    if (!pos) return undefined;
    const out = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const esc = (e) => e.key === 'Escape' && close();
    // Follow the button while the page scrolls; scrolling inside the menu is ignored.
    const follow = (e) => { if (menu.current?.contains(e.target)) return; setPos(place()); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    window.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow); };
  }, [!!pos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-place once the real menu height is known.
  useEffect(() => { if (pos && menu.current) { const p2 = place(); if (p2 && (p2.top !== pos.top || p2.left !== pos.left)) setPos(p2); } }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button ref={btn} className="icon-btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={() => (pos ? close() : setPos(place()))}><MoreHorizontal size={16} /></button>
      {pos && createPortal(<div ref={menu} className="row-menu" role="menu" style={{ left: pos.left, top: pos.top }}>{children(close)}</div>, document.body)}
    </>
  );
}

export function AdminSupport() {
  const { t, locale } = useLang();
  useDbVersion();
  const location = useLocation();
  const [filter, setFilter] = useState('unresolved');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(() => new URLSearchParams(location.search).get('open'));
  const [reply, setReply] = useState('');
  const [error, setError] = useState(null);
  const st = ticketStats();
  const all = getTickets();
  const list = all.filter((x) => (filter === 'All' ? true : filter === 'unresolved' ? x.status !== 'Resolved' : x.status === filter))
    .filter((x) => !q || [x.id, x.subject, x.company, x.email].some((v) => String(v).toLowerCase().includes(q.toLowerCase())));
  const tk = all.find((x) => x.id === openId);
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [done, setDone] = useState('');
  const flash = (m) => { setDone(m); setTimeout(() => setDone(''), 2200); };
  const toggle = (id) => setSelected((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const act = (ids, patch, message) => { const n = updateTickets(ids, patch); if (message && n) flash(message); };
  const bulk = (patch) => { const n = updateTickets(selected, patch); flash(t('{n} ticket(s) updated.', { n })); setSelected([]); };
  const send = (status) => { setError(null); try { replyTicket(tk.id, { from: 'support', name: 'MEI Support', text: reply, status }); setReply(''); } catch (e) { setError(e); } };
  const PRIO = { Urgent: 'red', High: 'orange', Normal: 'blue', Low: 'gray' };

  return (
    <>
      <PageTitle title="Support tickets" sub="Questions and problems from customers and website visitors." />
      <div className="stat-grid">
        <Stat icon={LifeBuoy} label="Open tickets" value={st.open} sub={t('{n} without reply', { n: st.unanswered })} onClick={() => setFilter('unresolved')} />
        <Stat icon={AlertTriangle} tone="red" label="Urgent or high" value={st.urgent} />
        <Stat icon={CalendarClock} tone="purple" label="Average first reply" value={st.avgFirstReplyH === null ? '—' : `${st.avgFirstReplyH.toFixed(1)} h`} />
        <Stat icon={CheckCircle2} tone="green" label="Resolved" value={st.resolved} onClick={() => setFilter('Resolved')} />
      </div>
      <div className="card mt-2">
        <div className="card-head">
          <div className="chip-group">
            {['unresolved', ...TICKET_STATUSES, 'All'].map((f) => <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{t(f === 'unresolved' ? 'Not resolved' : `${f}|status`)}</button>)}
          </div>
          <div className="input-wrap" style={{ minWidth: 240 }}><Search size={16} /><input className="input" placeholder={t('Search ticket, company…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        {selected.length > 0 && (
          <div className="bulk-bar">
            <b>{t('{n} selected', { n: selected.length })}</b>
            <button className="btn btn-outline btn-sm" onClick={() => bulk({ status: 'Resolved' })}><CheckCircle2 size={15} /> {t('Mark resolved')}</button>
            <button className="btn btn-outline btn-sm" onClick={() => bulk({ status: 'In progress' })}><RotateCcw size={15} /> {t('Reopen')}</button>
            <select className="input input-sm" value="" onChange={(e) => e.target.value && bulk({ assignee: e.target.value === '-' ? '' : e.target.value })} aria-label={t('Assign to')}>
              <option value="">{t('Assign to…')}</option>{TICKET_TEAMS.map((x) => <option key={x} value={x}>{t(x)}</option>)}<option value="-">{t('Unassigned')}</option>
            </select>
            <select className="input input-sm" value="" onChange={(e) => e.target.value && bulk({ priority: e.target.value })} aria-label={t('Priority')}>
              <option value="">{t('Set priority…')}</option>{TICKET_PRIORITIES.map((x) => <option key={x} value={x}>{t(x)}</option>)}
            </select>
            {confirmDel === 'bulk'
              ? <><span className="text-danger" style={{ fontSize: 13 }}>{t('Delete {n} ticket(s)?', { n: selected.length })}</span><button className="btn btn-danger btn-sm" onClick={() => { deleteTickets(selected); setSelected([]); setConfirmDel(null); flash(t('Deleted.')); }}>{t('Delete')}</button><button className="btn btn-outline btn-sm" onClick={() => setConfirmDel(null)}>{t('Cancel')}</button></>
              : <button className="btn btn-outline btn-sm text-danger" onClick={() => setConfirmDel('bulk')}><Trash2 size={15} /> {t('Delete')}</button>}
            <button className="link-btn" onClick={() => setSelected([])}>{t('Clear')}</button>
          </div>
        )}
        {done && <div className="alert success mb-1"><CheckCircle2 size={16} /> {done}</div>}
        <div className="table-wrap">
          <table className="table-click tickets-table">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label={t('Select all')} checked={list.length > 0 && list.every((x) => selected.includes(x.id))} onChange={(e) => setSelected(e.target.checked ? list.map((x) => x.id) : [])} /></th>
              <th>{t('Ticket')}</th><th>{t('Subject')}</th><th>{t('Company')}</th><th>{t('Priority')}</th><th>{t('Status')}</th><th>{t('Assigned')}</th><th>{t('Updated')}</th><th style={{ textAlign: 'end' }}>{t('Actions')}</th>
            </tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} onClick={() => setOpenId(x.id)} className={selected.includes(x.id) ? 'row-selected' : ''}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={x.id} checked={selected.includes(x.id)} onChange={() => toggle(x.id)} /></td>
                  <td dir="ltr" className="muted">{x.id}</td>
                  <td><strong>{x.subject}</strong><div className="muted" style={{ fontSize: 12 }}>{t(x.category)}{!x.messages.some((m) => m.from === 'support') && x.status !== 'Resolved' && <span className="badge orange" style={{ marginInlineStart: 6 }}>{t('No reply yet')}</span>}</div></td>
                  <td>{x.company || <span className="muted">{x.email}</span>}</td>
                  <td><span className={`badge ${PRIO[x.priority]}`}>{t(x.priority)}</span></td>
                  <td><span className={`badge ${x.status === 'Resolved' ? 'green' : x.status === 'Open' ? 'orange' : x.status === 'Waiting for customer' ? 'purple' : 'blue'}`}>{t(`${x.status}|status`)}</span></td>
                  <td>{x.assignee ? t(x.assignee) : <span className="muted">{t('Unassigned')}</span>}</td>
                  <td className="muted">{timeAgo(x.updatedAt || x.createdAt, t)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="icon-btn" title={t('Reply')} aria-label={t('Reply')} onClick={() => setOpenId(x.id)}><MessageSquare size={15} /></button>
                      {x.status !== 'Resolved'
                        ? <button className="icon-btn ok" title={t('Mark resolved')} aria-label={t('Mark resolved')} onClick={() => act([x.id], { status: 'Resolved' }, t('{id} resolved.', { id: x.id }))}><CheckCircle2 size={15} /></button>
                        : <button className="icon-btn" title={t('Reopen')} aria-label={t('Reopen')} onClick={() => act([x.id], { status: 'In progress' }, t('{id} reopened.', { id: x.id }))}><RotateCcw size={15} /></button>}
                      <RowMenu label={t('More actions')}>
                        {(close) => (
                          <>
                            <div className="rm-label">{t('Assign to')}</div>
                            {TICKET_TEAMS.map((tm) => <button key={tm} className={x.assignee === tm ? 'on' : ''} onClick={() => { act([x.id], { assignee: tm }, t('{id} assigned to {team}.', { id: x.id, team: t(tm) })); close(); }}><UserCheck size={14} /> {t(tm)}</button>)}
                            <div className="rm-label">{t('Priority')}</div>
                            <div className="rm-row">{TICKET_PRIORITIES.map((pr) => <button key={pr} className={`rm-chip ${x.priority === pr ? 'on' : ''}`} onClick={() => { act([x.id], { priority: pr }); close(); }}>{t(pr)}</button>)}</div>
                            <div className="rm-sep" />
                            {x.status !== 'Waiting for customer' && x.status !== 'Resolved' && <button onClick={() => { act([x.id], { status: 'Waiting for customer' }); close(); }}><Clock size={14} /> {t('Wait for customer')}</button>}
                            {x.status === 'Open' && <button onClick={() => { act([x.id], { status: 'In progress' }); close(); }}><PlayCircle size={14} /> {t('Start working on it')}</button>}
                            {x.userId && <button onClick={() => { close(); navigate(`/admin/companies?open=${x.userId}`); }}><Building2 size={14} /> {t('Open company')}</button>}
                            {x.userId && <button onClick={() => { close(); navigate('/admin/notifications', { state: { selected: [x.userId] } }); }}><Megaphone size={14} /> {t('Send notification')}</button>}
                            {x.email && <a href={`mailto:${x.email}?subject=${encodeURIComponent(`[${x.id}] ${x.subject}`)}`} onClick={close}><Mail size={14} /> {t('Email the customer')}</a>}
                            <div className="rm-sep" />
                            <button className="danger" onClick={() => { close(); setConfirmDel(x.id); }}><Trash2 size={14} /> {t('Delete ticket')}</button>
                          </>
                        )}
                      </RowMenu>
                    </div>
                    {confirmDel === x.id && (
                      <div className="row-confirm">
                        <span>{t('Delete {id}?', { id: x.id })}</span>
                        <button className="btn btn-danger btn-sm" onClick={() => { deleteTickets([x.id]); setConfirmDel(null); flash(t('{id} deleted.', { id: x.id })); }}>{t('Delete')}</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setConfirmDel(null)}>{t('Cancel')}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan="9" className="center muted" style={{ padding: 28 }}>{t('No tickets.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {tk && (
        <div className="drawer-backdrop" onClick={() => setOpenId(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div><span className="muted" dir="ltr" style={{ fontSize: 13 }}>{tk.id} · {t(tk.source)}</span><h3 className="mb-0">{tk.subject}</h3></div>
              <button className="ab-close" onClick={() => setOpenId(null)} aria-label={t('Close')}><X size={18} /></button>
            </div>
            <div className="kv-grid">
              <div><span>{t('Company')}</span><b>{tk.company || '—'}</b></div>
              <div><span>{t('Contact')}</span><b>{tk.name}<div className="muted" dir="ltr" style={{ fontSize: 12 }}>{tk.email}</div></b></div>
              <div><span>{t('Category')}</span><select className="input input-sm" value={tk.category} onChange={(e) => setTicket(tk.id, { category: e.target.value })}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></div>
              <div><span>{t('Priority')}</span><select className="input input-sm" value={tk.priority} onChange={(e) => setTicket(tk.id, { priority: e.target.value })}>{TICKET_PRIORITIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></div>
              <div><span>{t('Status')}</span><select className="input input-sm" value={tk.status} onChange={(e) => setTicket(tk.id, { status: e.target.value })}>{TICKET_STATUSES.map((c) => <option key={c} value={c}>{t(`${c}|status`)}</option>)}</select></div>
              <div><span>{t('Assigned')}</span><select className="input input-sm" value={tk.assignee || ''} onChange={(e) => setTicket(tk.id, { assignee: e.target.value })}><option value="">{t('Unassigned')}</option>{TICKET_TEAMS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></div>
              <div><span>{t('Opened')}</span><b>{fmtDateTime(tk.createdAt, locale)}</b></div>
            </div>
            {tk.activity?.length > 0 && (
              <details className="ticket-trail">
                <summary>{t('History ({n} changes)', { n: tk.activity.length })}</summary>
                <ul>{[...tk.activity].reverse().map((a, i) => <li key={i}><b>{t(FIELD_LABEL[a.field] || a.field)}</b>: {a.from ? t(a.field === 'status' ? `${a.from}|status` : a.from) : '—'} → {a.to ? t(a.field === 'status' ? `${a.to}|status` : a.to) : t('Unassigned')} <small className="muted">· {fmtDateTime(a.at, locale)}</small></li>)}</ul>
              </details>
            )}
            <div className="ticket-msgs">
              {tk.messages.map((m, i) => (
                <div key={i} className={`ticket-msg ${m.from}`}><small>{m.name || t(m.from === 'support' ? 'MEI Support' : 'Customer')} · {fmtDateTime(m.at, locale)}</small><p dir="auto">{m.text}</p></div>
              ))}
            </div>
            <div className="field"><label>{t('Reply')}</label><textarea className="input" rows="4" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('Write your answer to the customer…')} /></div>
            {error && <div className="alert error mt-1">{errText(t, error)}</div>}
            <div className="flex gap-1 mt-1 wrap">
              <button className="btn btn-primary btn-sm" onClick={() => send()} disabled={!reply.trim()}><Send size={15} /> {t('Send reply')}</button>
              <button className="btn btn-outline btn-sm" onClick={() => send('Waiting for customer')} disabled={!reply.trim()}>{t('Reply and wait for customer')}</button>
              <button className="btn btn-outline btn-sm" onClick={() => send('Resolved')}><CheckCircle2 size={15} /> {t(reply.trim() ? 'Reply and resolve' : 'Mark resolved')}</button>
            </div>
            {tk.userId && <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('The customer gets a notification in their dashboard when you reply.')}</p>}
          </aside>
        </div>
      )}
    </>
  );
}

/* ====================== Notifications to companies ====================== */
export function AdminNotifications() {
  const { t, locale } = useLang();
  useDbVersion();
  const location = useLocation();
  const [f, setF] = useState({
    audience: location.state?.audience || (location.state?.selected ? 'selected' : 'all'), packageId: 'standard', selected: location.state?.selected || [],
    level: 'info', title: '', message: '', link: '',
  });
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);
  const comps = useMemo(() => companyStats().sort((a, b) => a.company.localeCompare(b.company)), []);
  const to = recipients(f);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => setF({ ...f, selected: f.selected.includes(id) ? f.selected.filter((x) => x !== id) : [...f.selected, id] });
  const history = getBroadcasts();

  const submit = (e) => {
    e.preventDefault(); setError(null); setSent(null);
    try { setSent(sendBroadcast(f)); setF({ ...f, title: '', message: '' }); } catch (err) { setError(err); }
  };

  const LEVELS = [['info', 'Information'], ['success', 'Good news'], ['warning', 'Warning'], ['danger', 'Important']];

  return (
    <>
      <PageTitle title="Notifications" sub="Send a message to one company, a group, or every company. It appears in their notification bell." />
      <div className="grid-2e">
        <form className="card" onSubmit={submit}>
          <h3>{t('New notification')}</h3>
          <div className="field"><label>{t('Send to')}</label>
            <select className="input" value={f.audience} onChange={set('audience')}>{AUDIENCES.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}</select></div>
          {f.audience === 'package' && (
            <div className="field"><label>{t('Package')}</label><select className="input" value={f.packageId} onChange={set('packageId')}>{packages.map((p) => <option key={p.id} value={p.id}>{t(p.name)}</option>)}</select></div>
          )}
          {f.audience === 'selected' && (
            <div className="field">
              <label>{t('Companies')} ({f.selected.length})</label>
              <div className="input-wrap mb-1"><Search size={16} /><input className="input" placeholder={t('Search…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="recipient-box">
                {comps.filter((c) => !q || c.company.toLowerCase().includes(q.toLowerCase())).map((c) => (
                  <label key={c.userId}><input type="checkbox" checked={f.selected.includes(c.userId)} onChange={() => toggle(c.userId)} /> {c.company} <span className="muted" style={{ fontSize: 12 }}>· {c.packageName ? t(c.packageName) : t('No package')}</span></label>
                ))}
              </div>
            </div>
          )}
          <div className="audience-count mb-2">{t('{n} companies will receive this', { n: to.length })}{to.length > 0 && to.length <= 4 ? `: ${to.map((c) => c.company).join(', ')}` : ''}</div>
          <div className="field"><label>{t('Type')}</label>
            <div className="seg-choice" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {LEVELS.map(([k, l]) => <button type="button" key={k} className={f.level === k ? 'on' : ''} onClick={() => setF({ ...f, level: k })}>{t(l)}</button>)}
            </div></div>
          <div className="field"><label>{t('Title *')}</label><input className="input" value={f.title} onChange={set('title')} maxLength={80} placeholder={t('e.g. Scheduled maintenance on Friday')} /></div>
          <div className="field"><label>{t('Message *')}</label><textarea className="input" rows="4" value={f.message} onChange={set('message')} maxLength={400} placeholder={t('What do you want to tell them?')} /></div>
          <div className="field"><label>{t('Button in the notification')}</label><select className="input" value={f.link} onChange={set('link')}>{LINKS.map((l) => <option key={l.id} value={l.id}>{t(l.label)}</option>)}</select></div>
          {error && <div className="alert error mb-1">{errText(t, error)}</div>}
          {sent && <div className="alert success mb-1"><CheckCircle2 size={18} /> {t('Sent to {n} companies.', { n: sent.count })}</div>}
          <button className="btn btn-primary" type="submit" disabled={!to.length}><Send size={16} /> {t('Send notification')}</button>
        </form>
        <div className="card">
          <h3>{t('Sent notifications')}</h3>
          <ul className="activity-list">
            {history.map((b) => (
              <li key={b.id}>
                <span className={`act-dot ${b.level === 'danger' ? 't-error' : b.level === 'warning' ? 't-wl' : 't-activity'}`} />
                <div><b>{b.title}</b><small>{b.message}</small><small>{t(AUDIENCES.find((a) => a.id === b.audience)?.label || '')} · {t('{n} companies', { n: b.count })}</small></div>
                <time className="muted">{fmtDate(b.at, locale)}</time>
              </li>
            ))}
            {!history.length && <li className="muted">{t('Nothing sent yet.')}</li>}
          </ul>
        </div>
      </div>
    </>
  );
}

/* ====================== Reports (grids with print / PDF / Excel) ====================== */
const ADMIN_REPORTS = [
  { id: 'sales', icon: Receipt, title: 'Sales & payments', desc: 'Every payment with VAT', ranged: true },
  { id: 'pl', icon: TrendingUp, title: 'Profit & loss', desc: 'Per period, after costs', ranged: true },
  { id: 'companies', icon: Building2, title: 'Companies & balances', desc: 'Invoices left, passed, failed' },
  { id: 'packages', icon: PackageIcon, title: 'Packages', desc: 'Subscribers, MRR and sales', ranged: true },
  { id: 'invoices', icon: FileSpreadsheet, title: 'All invoices', desc: 'Across every company', ranged: true },
  { id: 'volume', icon: BarChart3, title: 'Invoice volume per company', desc: 'Passed, failed, value', ranged: true },
  { id: 'support', icon: LifeBuoy, title: 'Support tickets', desc: 'Status and reply time' },
];

function adminReport(id, range, t) {
  switch (id) {
    case 'sales': {
      const s = salesReport(range);
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'date' }, { key: 'id', label: 'Payment ID', ltr: true }, { key: 'company', label: 'Company', strong: true },
          { key: 'type', label: 'Type', translate: true }, { key: 'packageName', label: 'Package', translate: true },
          { key: 'net', label: 'Amount excl. VAT', type: 'money' }, { key: 'vat', label: 'VAT', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'status', label: 'Status', type: 'badge' },
        ],
        rows: s.payments.map((p) => { const vat = p.vat !== undefined ? p.vat : +(p.total - p.total / (1 + (p.vatRate ?? 5) / 100)).toFixed(2); return { ...p, key: `${p.userId}-${p.id}`, vat, net: +(p.total - vat).toFixed(2) }; }),
        sort: { key: 'date', dir: 'desc' },
      };
    }
    case 'pl': {
      const r = plByPeriod(range);
      return {
        columns: [
          { key: 'date', label: 'Period', nowrap: true, format: (v) => (r.unit === 'month' ? new Date(v).toLocaleDateString(t.locale, { month: 'long', year: 'numeric' }) : fmtDate(v, t.locale)) },
          { key: 'gross', label: 'Sales incl. VAT', type: 'money' }, { key: 'vat', label: 'VAT', type: 'money' }, { key: 'revenue', label: 'Revenue without VAT', type: 'money' },
          { key: 'refunds', label: 'Refunds', type: 'money' }, { key: 'delivery', label: 'Peppol delivery', type: 'money' }, { key: 'gateway', label: 'Gateway fees', type: 'money' },
          { key: 'fixed', label: 'Fixed costs', type: 'money' }, { key: 'profit', label: 'Profit', type: 'money' }, { key: 'margin', label: 'Margin', type: 'percent' },
        ],
        rows: r.rows, sort: { key: 'date', dir: 'desc' },
      };
    }
    case 'companies':
      return {
        columns: [
          { key: 'company', label: 'Company', strong: true }, { key: 'trn', label: 'TRN', ltr: true }, { key: 'owner', label: 'Owner' }, { key: 'emirate', label: 'Emirate', translate: true },
          { key: 'packageName', label: 'Package', translate: true }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'endDate', label: 'Ends', type: 'date' },
          { key: 'limit', label: 'Limit', type: 'number' }, { key: 'used', label: 'Used', type: 'number' }, { key: 'left', label: 'Left', type: 'number' },
          { key: 'success', label: 'Passed', type: 'number' }, { key: 'failed', label: 'Failed', type: 'number' }, { key: 'inProgress', label: 'Pending', type: 'number' },
          { key: 'revenue', label: 'Revenue', type: 'money' },
        ],
        rows: companyStats().map((c) => ({ ...c, key: c.userId, left: Math.max(0, c.limit - c.used) })), sort: { key: 'left', dir: 'asc' },
      };
    case 'packages': {
      const s = salesReport(range); const comps = companyStats();
      return {
        columns: [
          { key: 'name', label: 'Package', translate: true, strong: true }, { key: 'price', label: 'Monthly price', type: 'money', total: false }, { key: 'transactions', label: 'Invoices / month', type: 'number', total: false },
          { key: 'users', label: 'Users', type: 'number', total: false }, { key: 'active', label: 'Active subscribers', type: 'number' }, { key: 'expired', label: 'Expired / locked', type: 'number' },
          { key: 'mrr', label: 'MRR', type: 'money' }, { key: 'sales', label: 'Sales', type: 'money' },
        ],
        rows: packages.map((p) => { const subs = comps.filter((c) => c.packageId === p.id); const a = subs.filter((c) => c.status === 'Active').length; return { key: p.id, name: p.name, price: p.price, transactions: p.transactions, users: p.users, active: a, expired: subs.length - a, mrr: a * p.price, sales: s.byPackage.find((x) => x.id === p.id)?.revenue || 0 }; }),
      };
    }
    case 'invoices':
      return {
        columns: [
          { key: 'invoice', label: 'Invoice', ltr: true, strong: true }, { key: 'date', label: 'Date', type: 'date' }, { key: 'company', label: 'Company' }, { key: 'customer', label: 'Customer' },
          { key: 'source', label: 'Source', translate: true }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'net', label: 'Net', type: 'money' }, { key: 'vat', label: 'VAT', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' }, { key: 'retries', label: 'Retries', type: 'number', total: false },
        ],
        rows: allInvoiceRows(range), sort: { key: 'date', dir: 'desc' },
      };
    case 'volume': {
      const r = platformReport(range);
      return {
        columns: [
          { key: 'company', label: 'Company', strong: true }, { key: 'total', label: 'Invoices', type: 'number' }, { key: 'success', label: 'Passed', type: 'number' },
          { key: 'failed', label: 'Failed', type: 'number' }, { key: 'rate', label: 'Success rate', type: 'percent' }, { key: 'amount', label: 'Value passed', type: 'money' },
        ],
        rows: r.companies.map((c) => ({ ...c, key: c.userId, rate: c.success + c.failed ? (c.success / (c.success + c.failed)) * 100 : null })), sort: { key: 'total', dir: 'desc' },
      };
    }
    case 'support':
      return {
        columns: [
          { key: 'id', label: 'Ticket', ltr: true }, { key: 'createdAt', label: 'Opened', type: 'date' }, { key: 'company', label: 'Company' }, { key: 'subject', label: 'Subject', strong: true },
          { key: 'category', label: 'Category', translate: true }, { key: 'priority', label: 'Priority', type: 'badge' }, { key: 'status', label: 'Status', type: 'badge', statusKey: true },
          { key: 'assignee', label: 'Assigned', translate: true }, { key: 'messages', label: 'Messages', type: 'number', total: false }, { key: 'firstReply', label: 'First reply (h)', type: 'number', total: false },
        ],
        rows: getTickets().map((x) => { const r = x.messages.find((m) => m.from === 'support'); return { ...x, company: x.company || x.email, messages: x.messages.length, firstReply: r ? +((new Date(r.at) - new Date(x.createdAt)) / 3600000).toFixed(1) : null }; }),
        sort: { key: 'createdAt', dir: 'desc' },
      };
    default: return { columns: [], rows: [] };
  }
}

export function AdminReports() {
  const { t, locale } = useLang();
  useDbVersion();
  const location = useLocation();
  const navigate = useNavigate();
  const id = new URLSearchParams(location.search).get('r') || 'sales';
  const def = ADMIN_REPORTS.find((r) => r.id === id) || ADMIN_REPORTS[0];
  const [range, setRange] = useState(thisMonth);
  const tl = Object.assign((k, v) => t(k, v), { locale });
  const rep = adminReport(def.id, range, tl);
  const rangeLabel = rangeText(range, locale);

  return (
    <>
      <PageTitle title="Reports" sub="Pick a report, search it, then print it or export it as PDF or Excel." />
      <div className="report-tabs">
        {ADMIN_REPORTS.map((r) => (
          <button key={r.id} className={`report-tab ${r.id === def.id ? 'on' : ''}`} onClick={() => navigate(`/admin/reports?r=${r.id}`, { replace: true })}>
            <r.icon size={20} /><span><b>{t(r.title)}</b><small>{t(r.desc)}</small></span>
          </button>
        ))}
      </div>
      <div className="card">
        <div className="card-head"><div><h3>{t(def.title)}</h3><small>{def.ranged ? rangeLabel : t('Current status')}</small></div></div>
        <ReportGrid
          key={`${def.id}-${rangeKey(range)}`}
          title={t(def.title)}
          subtitle={def.ranged ? rangeLabel : t('Current status')}
          meta={[t('System admin report')]}
          fileName={`MEI-${def.id}${def.ranged ? `-${rangeKey(range)}` : ''}`}
          columns={rep.columns}
          rows={rep.rows}
          initialSort={rep.sort}
          toolbar={def.ranged ? <DateRangeFilter value={range} onChange={setRange} presets={DATE_PRESETS} /> : null}
        />
      </div>
    </>
  );
}

/* ====================== Companies ====================== */
const COMPANY_FILTERS = [
  ['all', 'All'], ['Active', 'Active'], ['low', 'Low balance'], ['expiring', 'Ending in 30 days'], ['Expired', 'Expired'], ['none', 'No package'], ['inactive', 'Deactivated'],
];

export function AdminCompanies() {
  const { t, locale } = useLang();
  useDbVersion();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [filter, setFilter] = useState(params.get('f') || 'all');
  const [pkg, setPkg] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('left');
  const [openId, setOpenId] = useState(params.get('open'));
  const all = companyStats();
  const in30 = Date.now() + 30 * 86400000;
  const matchKey = (c, key) => {
    switch (key) {
      case 'Active': return c.status === 'Active';
      case 'low': return c.status === 'Active' && c.limit && c.usedPct >= 80;
      case 'expiring': return c.status === 'Active' && c.endDate && new Date(c.endDate) <= in30;
      case 'Expired': return c.status === 'Expired' || c.status === 'Refunded (Locked)';
      case 'none': return !c.packageId;
      case 'inactive': return !c.active;
      default: return true;
    }
  };
  const SORTS = {
    left: (a, b) => (a.limit ? a.limit - a.used : 1e9) / (a.limit || 1) - (b.limit ? b.limit - b.used : 1e9) / (b.limit || 1),
    revenue: (a, b) => b.revenue - a.revenue, invoices: (a, b) => b.invoices - a.invoices, newest: (a, b) => b.createdAt.localeCompare(a.createdAt), name: (a, b) => a.company.localeCompare(b.company),
  };
  const list = all.filter((x) => matchKey(x, filter)).filter((c) => !pkg || c.packageId === pkg)
    .filter((c) => !q || [c.company, c.owner, c.email, c.trn].some((v) => String(v).toLowerCase().includes(q.toLowerCase()))).sort(SORTS[sort]);
  const c = all.find((x) => x.userId === openId);
  const totals = { left: list.reduce((a, x) => a + Math.max(0, x.limit - x.used), 0), passed: list.reduce((a, x) => a + x.success, 0), failed: list.reduce((a, x) => a + x.failed, 0), pending: list.reduce((a, x) => a + x.inProgress, 0), revenue: list.reduce((a, x) => a + x.revenue, 0) };

  const exportIt = () => exportSheets('MEI-companies.xlsx', [['Companies', [['Company', 'TRN', 'Owner', 'Email', 'Package', 'Status', 'Ends', 'Limit', 'Used', 'Left', 'Passed', 'Failed', 'Pending', 'Users', 'Revenue (AED)'],
    ...list.map((x) => [x.company, x.trn, x.owner, x.email, x.packageName || '', x.status, x.endDate ? x.endDate.slice(0, 10) : '', x.limit, x.used, Math.max(0, x.limit - x.used), x.success, x.failed, x.inProgress, x.users, +x.revenue.toFixed(2)])]]]);

  return (
    <>
      <PageTitle title="Companies" sub="Every registered company: package, invoices left, invoices passed and failed, and what they paid.">
        <button className="btn btn-outline btn-sm" onClick={exportIt}><Download size={15} /> {t('Export')}</button>
      </PageTitle>
      <div className="card">
        <div className="card-head">
          <div className="chip-group">
            {COMPANY_FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{t(l)} <span className="subtab-count">{all.filter((x) => matchKey(x, k)).length}</span></button>)}
          </div>
        </div>
        <div className="flex gap-1 wrap mb-2">
          <div className="input-wrap" style={{ flex: 1, minWidth: 220, maxWidth: 340 }}><Search size={16} /><input className="input" placeholder={t('Search company, owner, TRN…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input" style={{ width: 'auto' }} value={pkg} onChange={(e) => setPkg(e.target.value)}><option value="">{t('All packages')}</option>{packages.map((p) => <option key={p.id} value={p.id}>{t(p.name)}</option>)}</select>
          <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="left">{t('Sort: least left first')}</option><option value="revenue">{t('Sort: highest revenue')}</option><option value="invoices">{t('Sort: most invoices')}</option><option value="newest">{t('Sort: newest')}</option><option value="name">{t('Sort: name')}</option>
          </select>
          {list.length > 0 && <Link to="/admin/notifications" state={{ selected: list.map((x) => x.userId) }} className="btn btn-outline btn-sm"><Megaphone size={15} /> {t('Notify these {n}', { n: list.length })}</Link>}
        </div>
        <div className="table-wrap">
          <table className="table-click">
            <thead><tr><th>{t('Company')}</th><th>{t('Package')}</th><th>{t('Left in package')}</th><th>{t('Passed')}</th><th>{t('Failed')}</th><th>{t('Pending')}</th><th>{t('Users')}</th><th>{t('Revenue')}</th><th>{t('Ends')}</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.userId} onClick={() => setOpenId(x.userId)} className={x.active ? '' : 'row-muted'}>
                  <td><strong>{x.company}</strong><div className="muted" style={{ fontSize: 12 }}>{x.owner}</div></td>
                  <td>{x.packageName ? t(x.packageName) : '—'}<div><Badge status={x.active ? x.status : 'Inactive'} /></div></td>
                  <td><LeftCell c={x} /></td>
                  <td dir="ltr" className="text-success" style={{ fontWeight: 600 }}>{x.success.toLocaleString()}</td>
                  <td dir="ltr">{x.failed ? <span className="badge red">{x.failed}</span> : <span className="muted">0</span>}</td>
                  <td dir="ltr">{x.inProgress ? <span className="badge orange">{x.inProgress}</span> : <span className="muted">0</span>}</td>
                  <td dir="ltr">{x.users} / {x.usersLimit || '—'}</td>
                  <td dir="ltr">{money0(x.revenue)}</td>
                  <td className="muted">{fmtDate(x.endDate, locale)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan="9" className="center muted" style={{ padding: 28 }}>{t('No companies match.')}</td></tr>}
            </tbody>
            {list.length > 0 && <tfoot><tr><td><b>{t('{n} companies', { n: list.length })}</b></td><td /><td dir="ltr"><b>{totals.left.toLocaleString()}</b> <span className="muted">{t('left')}</span></td><td dir="ltr"><b>{totals.passed.toLocaleString()}</b></td><td dir="ltr"><b>{totals.failed}</b></td><td dir="ltr"><b>{totals.pending}</b></td><td /><td dir="ltr"><b>{money0(totals.revenue)}</b></td><td /></tr></tfoot>}
          </table>
        </div>
      </div>
      {c && <CompanyDrawer c={c} onClose={() => setOpenId(null)} navigate={navigate} />}
    </>
  );
}

function CompanyDrawer({ c, onClose, navigate }) {
  const { t, locale } = useLang();
  const u = getUserById(c.userId);
  const [grant, setGrant] = useState('');
  const [granted, setGranted] = useState(0);
  if (!u) return null;
  const recent = (u.invoices || []).slice(0, 5);
  const pays = [...(u.payments || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><span className="muted" style={{ fontSize: 13 }}>{t('Company')}</span><h3 className="mb-0">{c.company}</h3></div>
          <div className="flex items-center gap-1"><Badge status={c.active ? c.status : 'Inactive'} /><button className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button></div>
        </div>
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          <div className="card-soft"><span className="muted" style={{ fontSize: 13 }}>{t('Left in package')}</span><LeftCell c={c} /></div>
          <div className="card-soft"><span className="muted" style={{ fontSize: 13 }}>{t('Revenue')}</span><div style={{ fontSize: 20, fontWeight: 700 }} dir="ltr">{formatMoney(c.revenue.toFixed(2))}</div></div>
          <div className="card-soft"><span className="muted" style={{ fontSize: 13 }}>{t('Invoices passed / failed / pending')}</span><div style={{ fontSize: 20, fontWeight: 700 }} dir="ltr"><span className="text-success">{c.success}</span> / <span className="text-danger">{c.failed}</span> / {c.inProgress}</div></div>
          <div className="card-soft"><span className="muted" style={{ fontSize: 13 }}>{t('Success rate')}</span><div style={{ fontSize: 20, fontWeight: 700 }} dir="ltr">{c.successRate === null ? '—' : `${c.successRate.toFixed(1)}%`}</div></div>
        </div>
        <div className="kv-grid mt-2">
          <div><span>{t('Owner')}</span><b>{u.fullName}</b></div>
          <div><span>{t('Email')}</span><b dir="ltr">{u.email}</b></div>
          <div><span>{t('TRN')}</span><b dir="ltr">{u.company?.trn || '—'}</b></div>
          <div><span>{t('Emirate')}</span><b>{t(u.company?.emirate || '—')}</b></div>
          <div><span>{t('Package')}</span><b>{c.packageName ? t(c.packageName) : '—'}</b></div>
          <div><span>{t('Ends')}</span><b>{fmtDate(c.endDate, locale)}</b></div>
          <div><span>{t('Users')}</span><b dir="ltr">{c.users} / {c.usersLimit || '—'}</b></div>
          <div><span>{t('Registered')}</span><b>{fmtDate(u.createdAt, locale)}</b></div>
          <div><span>{t('Customers / items')}</span><b dir="ltr">{c.customers} / {c.items}</b></div>
          <div><span>{t('Last invoice')}</span><b>{c.lastInvoice ? timeAgo(c.lastInvoice, t) : '—'}</b></div>
        </div>

        <div className="flex gap-1 wrap mt-2">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/notifications', { state: { selected: [c.userId] } })}><Megaphone size={15} /> {t('Send notification')}</button>
          <button className={`btn btn-sm ${u.disabled ? 'btn-primary' : 'btn-outline'}`} onClick={() => setCompanyActive(u.id, !!u.disabled)}><Power size={15} /> {t(u.disabled ? 'Activate company' : 'Deactivate company')}</button>
        </div>
        {u.subscription && (
          <div className="card-soft mt-2">
            <b>{t('Add free invoices')}</b>
            <p className="muted mb-1" style={{ fontSize: 13 }}>{t('Goodwill credit added to the current package, for example after an outage.')}</p>
            <div className="flex gap-1">
              <input className="input" dir="ltr" type="number" min="1" style={{ maxWidth: 140 }} value={grant} onChange={(e) => setGrant(e.target.value)} placeholder="50" />
              <button className="btn btn-outline btn-sm" disabled={!(Number(grant) > 0)} onClick={() => { setGranted(grantInvoices(u.id, grant, 'Admin credit')); setGrant(''); }}>{t('Add')}</button>
            </div>
            {granted > 0 && <div className="alert success mt-1"><CheckCircle2 size={16} /> {t('{n} invoices added.', { n: granted })}</div>}
          </div>
        )}

        <h4 className="mt-2">{t('Payments')}</h4>
        <ul className="tl-mini">
          {pays.map((p) => <li key={p.id}>{fmtDate(p.date, locale)} · {t(p.type || '')} · <b dir="ltr">{formatMoney(p.total)}</b></li>)}
          {!pays.length && <li className="muted">{t('No payments yet.')}</li>}
        </ul>
        <h4 className="mt-2">{t('Latest invoices')}</h4>
        <ul className="tl-mini">
          {recent.map((i) => <li key={i.id}><span dir="ltr">{i.id}</span> · {i.customerName} · {formatMoney(i.total)} · <Badge status={i.status} /></li>)}
          {!recent.length && <li className="muted">{t('No invoices yet.')}</li>}
        </ul>
        <h4 className="mt-2">{t('Users')}</h4>
        <ul className="tl-mini">
          <li><b>{u.fullName}</b> · {t('Owner')}</li>
          {(u.teamUsers || []).map((m) => <li key={m.id}>{m.name} · {t(m.role)} · <Badge status={m.status} /></li>)}
        </ul>
      </aside>
    </div>
  );
}
