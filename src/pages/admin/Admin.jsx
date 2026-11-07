import { useMemo, useState } from 'react';
import { NavLink, Outlet, Navigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Package, Building2, Users, ListOrdered, RotateCcw, ScrollText, Settings,
  Send, Clock, Loader, XCircle, Search, X, Power, History, Server, AlertOctagon, UserCog, Gauge, Plug,
  TrendingUp, BarChart3, LifeBuoy, Megaphone, Activity, Percent,
} from 'lucide-react';
import { ticketStats } from '../../services/support';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { stats, last24h, companies, allInvoices, customers, setCompanyActive, setTeamUserStatus } from '../../services/admin';
import { allRefunds } from '../../services/refunds';
import { getLogs } from '../../services/logs';
import { DailyChart, ChartLegend } from '../../components/DashboardCharts';
import { fmtDate, fmtTime, STATUS_BADGE, timeAgo } from '../../utils/format';
import { formatMoney } from '../../data/packages';
import { getUserById } from '../../services/api';

const NAV_GROUPS = [
  { label: 'Overview', items: [
    { to: '/admin', end: true, icon: LayoutDashboard, label: 'Business overview' },
  ] },
  { label: 'Business', items: [
    { to: '/admin/sales', icon: TrendingUp, label: 'Sales & profit' },
    { to: '/admin/packages', icon: Package, label: 'Packages' },
    { to: '/admin/companies', icon: Building2, label: 'Companies' },
    { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
  ] },
  { label: 'Customer care', items: [
    { to: '/admin/support', icon: LifeBuoy, label: 'Support tickets', count: 'support' },
    { to: '/admin/notifications', icon: Megaphone, label: 'Notifications' },
    { to: '/admin/refunds', icon: RotateCcw, label: 'Refund requests', count: 'refunds' },
  ] },
  { label: 'Operations', items: [
    { to: '/admin/monitoring', icon: Activity, label: 'Invoice monitoring' },
    { to: '/admin/queue', icon: ListOrdered, label: 'Sync queue', count: 'queue' },
    { to: '/admin/invoices', icon: FileText, label: 'Invoices' },
    { to: '/admin/logs', icon: ScrollText, label: 'Logs' },
  ] },
  { label: 'System', items: [
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/tax', icon: Percent, label: 'Tax & VAT' },
    { to: '/admin/integrations', icon: Plug, label: 'Integrations' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ] },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

export function AdminLayout() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { t } = useLang();
  useDbVersion();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: '/admin' }} />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  const counts = {
    refunds: allRefunds().filter((r) => r.status === 'Pending').length,
    support: ticketStats().unanswered,
    queue: stats().queued + stats().retrying + stats().processing,
  };
  return (
    <div className="dash admin">
      <aside className="dash-side">
        <div className="admin-tag">{t('Admin panel')}</div>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="side-group-admin">
            <div className="side-label">{t(g.label)}</div>
            {g.items.map(({ to, end, icon: Icon, label, count }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'on' : '')}>
                <Icon size={18} /> {t(label)}
                {count && counts[count] > 0 && <span className="nav-count">{counts[count]}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <main className="dash-main">
        <nav className="admin-mobile-nav">
          {NAV.map(({ to, end, label }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'on' : '')}>{t(label)}</NavLink>)}
        </nav>
        <Outlet />
      </main>
    </div>
  );
}

export const PageTitle = ({ title, sub, children }) => {
  const { t } = useLang();
  return (
    <div className="flex between items-center wrap gap-2 mb-3">
      <div><h1 style={{ fontSize: 26 }}>{t(title)}</h1>{sub && <p className="muted mb-0">{t(sub)}</p>}</div>
      {children}
    </div>
  );
};

export const Badge = ({ status }) => {
  const { t } = useLang();
  return <span className={`badge ${STATUS_BADGE[status] || 'gray'}`}>{t(status)}</span>;
};

export function UsageBar({ used, limit }) {
  const pct = limit ? Math.min(1, used / limit) : 0;
  const c = pct > 0.9 ? '#ef4444' : pct > 0.75 ? '#f59e0b' : '#1a86a6';
  return (
    <div className="usage-cell">
      <span dir="ltr">{used.toLocaleString()} / {limit.toLocaleString()}</span>
      <span className="ub"><i style={{ width: `${pct * 100}%`, background: c }} /></span>
    </div>
  );
}

/* ====================== Dashboard (diagram 4) ====================== */
export function AdminDashboard() {
  const { t, locale } = useLang();
  useDbVersion();
  const st = stats();
  const hours = last24h();
  const comps = companies().filter((c) => c.packageName).sort((a, b) => b.used / (b.limit || 1) - a.used / (a.limit || 1));
  const activity = getLogs().slice(0, 8);

  const kpis = [
    { icon: Users, c: '', label: 'Total customers', value: st.customers },
    { icon: FileText, c: 'green', label: 'Total invoices today', value: st.invoicesToday },
    { icon: Clock, c: 'orange', label: 'In queue', value: st.queued + st.retrying },
    { icon: Loader, c: 'purple', label: 'Processing', value: st.processing },
    { icon: Send, c: 'green', label: 'Sent', value: st.sent },
    { icon: XCircle, c: 'red', label: 'Failed', value: st.failed },
  ];
  const r = 26, C = 2 * Math.PI * r;

  return (
    <>
      <PageTitle title="Invoice monitoring" sub="Real-time view of invoice processing, the sync queue and the Qvalia (White Label) integration." />
      <div className="admin-kpis">
        {kpis.map(({ icon: Icon, c, label, value }) => (
          <div className="card kpi" key={label}>
            <div className={`icon-box ${c}`}><Icon size={20} /></div>
            <div><span>{t(label)}</span><strong dir="ltr">{value.toLocaleString()}</strong></div>
          </div>
        ))}
        <div className="card kpi">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r={r} stroke="#eef1f6" strokeWidth="7" fill="none" />
            <circle cx="32" cy="32" r={r} stroke="#16a34a" strokeWidth="7" fill="none" strokeDasharray={C} strokeDashoffset={C * (1 - st.successRate / 100)} strokeLinecap="round" transform="rotate(-90 32 32)" />
          </svg>
          <div><span>{t('Success rate')}</span><strong dir="ltr">{st.successRate.toFixed(1)}%</strong></div>
        </div>
      </div>

      <div className="dash-grid mt-2">
        <div className="card">
          <div className="flex between items-center wrap gap-1 mb-2">
            <div><h3 className="mb-0">{t('Invoice processing')}</h3><span className="muted" style={{ fontSize: 13 }}>{t('Last 24 hours')}</span></div>
            <ChartLegend />
          </div>
          <DailyChart days={hours} labelEvery={4} labelFn={(d) => `${String(d.hour).padStart(2, '0')}:00`} />
        </div>
        <div className="card">
          <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Queue status')}</h3><Link to="/admin/queue" className="link-btn">{t('Open')} →</Link></div>
          {[
            ['Pending', st.queued, '#f59e0b'],
            ['Processing', st.processing, '#1f7fb5'],
            ['Retrying', st.retrying, '#c99b5b'],
            ['Failed', st.failed, '#ef4444'],
          ].map(([label, n, color]) => (
            <div className="queue-row" key={label}>
              <span><i style={{ background: color }} /> {t(label)}</span><b dir="ltr">{n}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-grid mt-2">
        <div className="card">
          <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Package usage')}</h3><Link to="/admin/companies" className="link-btn">{t('View all')} →</Link></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Company')}</th><th>{t('Package')}</th><th>{t('Transactions')}</th><th>{t('Users')}</th><th>{t('End date')}</th></tr></thead>
              <tbody>
                {comps.slice(0, 6).map((c) => (
                  <tr key={c.userId}>
                    <td><strong>{c.company}</strong></td><td>{t(c.packageName)}</td>
                    <td><UsageBar used={c.used} limit={c.limit} /></td>
                    <td dir="ltr">{c.users} / {c.usersLimit}</td>
                    <td className="muted">{fmtDate(c.endDate, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Recent activities')}</h3><Link to="/admin/logs" className="link-btn">{t('View all')} →</Link></div>
          <ul className="activity-list">
            {activity.map((l) => (
              <li key={l.id}>
                <span className={`act-dot t-${l.type}`} />
                <div><b>{t(l.action, l.vars)}</b><small>{l.company ? `${l.company} · ` : ''}{t(l.details, l.vars)}</small></div>
                <time className="muted">{fmtTime(l.at, locale)}</time>
              </li>
            ))}
            {!activity.length && <li className="muted">{t('No activity yet.')}</li>}
          </ul>
        </div>
      </div>

      <div className="report-links mt-2">
        {[
          [History, 'Invoice history', '/admin/invoices'],
          [ScrollText, 'Transaction logs', '/admin/logs?type=transaction'],
          [Gauge, 'Package usage', '/admin/companies'],
          [Server, 'White Label responses', '/admin/logs?type=wl'],
          [AlertOctagon, 'Error logs', '/admin/logs?type=error'],
          [UserCog, 'User activity', '/admin/logs?type=activity'],
        ].map(([Icon, label, to]) => (
          <Link key={label} to={to} className="report-link"><Icon size={20} /> {t(label)}</Link>
        ))}
      </div>
    </>
  );
}

/* ====================== Users ====================== */
export function AdminUsers() {
  const { t } = useLang();
  const v = useDbVersion();
  const [q, setQ] = useState('');
  const rows = useMemo(() => customers().flatMap((u) => [
    { key: u.id, ownerId: u.id, name: u.fullName, email: u.email, role: 'Owner', status: u.disabled ? 'Inactive' : 'Active', company: u.company?.name || '—', owner: true },
    ...(u.teamUsers || []).map((m) => ({ key: m.id, ownerId: u.id, memberId: m.id, name: m.name, email: m.email, role: m.role, status: m.status, company: u.company?.name || '—' })),
  ]), [v]);
  const list = rows.filter((r) => !q || [r.name, r.email, r.company].some((v) => String(v).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageTitle title="Users" sub="All users across customer companies.">
        <div className="input-wrap" style={{ minWidth: 260 }}><Search size={16} /><input className="input" placeholder={t('Search name, email, company…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PageTitle>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Company')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.key} className={r.status !== 'Active' ? 'row-muted' : ''}>
                  <td><strong>{r.name}</strong></td><td dir="ltr">{r.email}</td><td>{r.company}</td>
                  <td>{r.owner ? <span className="badge orange">{t('Owner')}</span> : t(r.role)}</td>
                  <td><Badge status={r.status} /></td>
                  <td className="row-actions">
                    {!r.owner && (
                      <button className="btn btn-outline btn-sm" onClick={() => setTeamUserStatus(r.ownerId, r.memberId, r.status === 'Active' ? 'Inactive' : 'Active')}>
                        {t(r.status === 'Active' ? 'Deactivate' : 'Activate')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ====================== All invoices ====================== */
export function AdminInvoices({ onOpen }) {
  const { t, locale } = useLang();
  useDbVersion();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const all = allInvoices();
  const list = all.filter((i) => (status === 'All' || i.status === status) && (!q || [i.id, i.company, i.customerName, i.queueId, i.wlInvoiceId].some((v) => v && String(v).toLowerCase().includes(q.toLowerCase()))));
  return (
    <>
      <PageTitle title="Invoice history" sub="Every invoice across all customers, with its queue and White Label status.">
        <div className="flex gap-1 wrap">
          <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            {['All', 'Queued', 'Processing', 'Sent to White Label', 'Retrying', 'Success', 'Failed', 'Cancelled'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </select>
          <div className="input-wrap" style={{ minWidth: 240 }}><Search size={16} /><input className="input" placeholder={t('Search invoice, company, queue ID…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      </PageTitle>
      <div className="card">
        <div className="table-wrap">
          <table className="table-click">
            <thead><tr><th>{t('Invoice')}</th><th>{t('Company')}</th><th>{t('Customer')}</th><th>{t('Created')}</th><th>{t('Source')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('White Label ID')}</th></tr></thead>
            <tbody>
              {list.slice(0, 150).map((i) => (
                <tr key={`${i.userId}-${i.id}`} onClick={() => onOpen?.(i)}>
                  <td><strong dir="ltr">{i.id}</strong></td><td>{i.company}</td><td>{i.customerName}</td>
                  <td className="muted">{timeAgo(i.createdAt, t)}</td><td>{t(i.source)}</td><td>{formatMoney(i.total)}</td>
                  <td><Badge status={i.status} /></td><td dir="ltr" className="muted">{i.wlInvoiceId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted mt-1" style={{ fontSize: 13 }}>{t('{n} invoices', { n: list.length })}</p>
      </div>
    </>
  );
}

