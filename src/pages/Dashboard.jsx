import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CreditCard, FileText, LogOut, CheckCircle2, PackagePlus,
  RefreshCcw, ArrowUpCircle, ArrowDownCircle, Loader2, AlertCircle, UserPlus, Send, Clock, AlertTriangle,
  TrendingUp, TrendingDown, CalendarClock, Receipt, X, Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveCompany, addTeamUser, upgradeQuote, scheduleDowngrade, cancelPendingChange, getDemoActivity, ensureActivity } from '../services/api';
import { packages, getPackage, formatMoney } from '../data/packages';
import { planAction } from '../data/planActions';
import { DailyChart, ChartLegend, StatusDonut, Sparkline } from '../components/DashboardCharts';
import AlertBanner, { InvoicesLeftPill } from '../components/AlertBanner';
import Invoices, { StatusBadge, InvoiceDetail } from './dashboard/Invoices';
import MasterData from './dashboard/MasterData';
import CompanyForm from './dashboard/CompanyForm';
import { invoicesLeft } from '../services/notifications';
import { ACTIVE_STATUSES } from '../services/invoices';
import { updateUser } from '../services/api';
import { Package as PackageIcon, BookUser, Tags, BarChart3, LifeBuoy, Check, Minus, KeyRound, Route, Gauge, GraduationCap, ShieldCheck, Activity } from 'lucide-react';
import { PortalOverview, Journey, Usage, ModelInvoices, PlanBilling, Consulting, Security, PortalButton, TermsGate } from './dashboard/Portal';
import ApiKeys from './dashboard/ApiKeys';
import { stageOf, STAGE_BADGE } from '../services/lifecycle';
import { feature } from '../services/platform';
import { useDbVersion } from '../hooks/useDb';
import CompanyReports from './dashboard/CompanyReports';
import CustomerSupport from './dashboard/CustomerSupport';
import { PERMISSIONS, ROLES, TEAM_ROLES, ROLE_HINT, normalizeRole } from '../services/permissions';
import { useLang, errText } from '../i18n/LanguageContext';

const fmtDate = (d, locale = 'en-GB') => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d, locale = 'en-GB') => new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
const daysLeft = (end) => Math.max(0, Math.ceil((new Date(end) - Date.now()) / 86400000));
const statusBadge = { Success: 'green', Processing: 'blue', Queued: 'orange', Failed: 'red' };

/** Daily sent/failed and status totals computed from the real invoice list. */
function statsFromInvoices(invoices) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    const list = invoices.filter((x) => x.createdAt.slice(0, 10) === key);
    return { date: key, sent: list.filter((x) => x.status === 'Success').length, failed: list.filter((x) => x.status === 'Failed').length };
  });
  const c = (st) => invoices.filter((x) => st.includes(x.status)).length;
  return { days, recent: [], totals: { sent: c(['Success']), failed: c(['Failed']), processing: c(['Processing', 'Sent to White Label']), queued: c(['Queued', 'Retrying']) } };
}

function Ring({ used, total }) {
  const { t, locale } = useLang();
  const r = 52; const c = 2 * Math.PI * r;
  const pct = total ? Math.min(used / total, 1) : 0;
  const color = pct > 0.9 ? '#ef4444' : pct > 0.75 ? '#f59e0b' : '#16a34a';
  return (
    <div className="ring">
      <svg width="120" height="120">
        <circle cx="60" cy="60" r={r} stroke="#eef1f6" strokeWidth="10" fill="none" />
        <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s' }} />
      </svg>
      <div className="ring-label"><div><strong>{Math.round(pct * 100)}%</strong>{t('used')}</div></div>
    </div>
  );
}

/* ================= Overview with statistics ================= */
function Overview({ user, setTab }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const s = user.subscription;
  // Real activity when there is a package; otherwise sample data so the dashboard is never empty.
  const realInv = user.invoices || [];
  const useReal = realInv.length >= 10;
  const a = useReal ? statsFromInvoices(realInv) : (user.activity || getDemoActivity(user.id));
  const [openInv, setOpenInv] = useState(null);
  const team = 1 + (user.teamUsers?.length || 0);

  const steps = [
    { t: 'Choose & pay for a package', done: !!s, action: !s && can('billing') && <Link to="/packages" className="btn btn-primary btn-sm">{t('Choose package')}</Link> },
    { t: 'Create your company', done: !!user.company, action: !user.company && can('company') && <button className="btn btn-outline btn-sm" onClick={() => setTab('company')}>{t('Add company')}</button> },
    { t: 'Add users', done: team > 1, action: team === 1 && can('users') && <button className="btn btn-outline btn-sm" onClick={() => setTab('users')}>{t('Add')}</button> },
    { t: 'Add your customers', done: !!user.customers?.length, action: !user.customers?.length && can('masterdata.edit') && <button className="btn btn-outline btn-sm" onClick={() => setTab('customers')}>{t('Add')}</button> },
    { t: 'Add your items', done: !!user.products?.length, action: !user.products?.length && can('masterdata.edit') && <button className="btn btn-outline btn-sm" onClick={() => setTab('items')}>{t('Add')}</button> },
    { t: 'Link with EmaraTax', done: user.linking?.status === 'Linked' },
  ];
  const progress = steps.filter((x) => x.done).length;

  const last7 = a ? a.days.slice(7) : [];
  const prev7 = a ? a.days.slice(0, 7) : [];
  const sum = (arr, k) => arr.reduce((x, d) => x + d[k], 0);
  const week = sum(last7, 'sent'), prevWeek = sum(prev7, 'sent');
  const delta = prevWeek ? Math.round(((week - prevWeek) / prevWeek) * 100) : 0;
  const successRate = a ? ((a.totals.sent / (a.totals.sent + a.totals.failed)) * 100).toFixed(1) : '0';
  const failedWeek = sum(last7, 'failed');
  const remaining = s ? invoicesLeft(user) : 0;
  const dl = s ? daysLeft(s.endDate) : 0;

  const kpis = [
    { icon: Send, c: '', label: 'Sent this week', value: week.toLocaleString(), delta, spark: a?.days.map((d) => d.sent), color: '#1f7fb5' },
    { icon: CheckCircle2, c: 'green', label: 'Success rate', value: `${successRate}%`, note: 'last 14 days', spark: a?.days.map((d) => d.sent - d.failed), color: '#16a34a' },
    { icon: AlertTriangle, c: 'red', label: 'Failed this week', value: failedWeek, note: 'auto-retried every 5–10 min', spark: a?.days.map((d) => d.failed), color: '#ef4444' },
    { icon: Clock, c: 'orange', label: 'In queue now', value: a?.totals.queued ?? 0, note: '{n} processing', noteVars: { n: a?.totals.processing ?? 0 } },
  ];

  return (
    <>
      {!useReal && <div className="demo-note"><AlertCircle size={14} /> {t('Sample data. Live figures will appear here once the invoicing backend is connected.')}</div>}

      <div className="kpi-grid">
        {kpis.map(({ icon: Icon, c, label, value, delta: d, note, noteVars, spark, color }) => (
          <div className="card kpi2" key={label}>
            <div className="flex between items-center">
              <span className={`icon-box mb-0 ${c}`} style={{ width: 36, height: 36 }}><Icon size={18} /></span>
              {spark && <Sparkline values={spark} color={color} />}
            </div>
            <span className="kpi2-label">{t(label)}</span>
            <strong className="kpi2-value" dir="ltr">{value}</strong>
            {d !== undefined ? (
              <span className={`kpi2-delta ${d >= 0 ? 'up' : 'down'}`}>
                {d >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {t('{n}% vs last week', { n: Math.abs(d) })}
              </span>
            ) : <span className="kpi2-note">{t(note, noteVars)}</span>}
          </div>
        ))}
      </div>

      <div className="dash-grid mt-2">
        <div className="card">
          <div className="flex between items-center wrap gap-1 mb-2">
            <div><h3 className="mb-0">{t('Invoices per day')}</h3><span className="muted" style={{ fontSize: 13 }}>{t('Last 14 days')}</span></div>
            <ChartLegend />
          </div>
          {a && <DailyChart days={a.days} />}
        </div>
        <div className="card">
          <h3>{t('Status breakdown')}</h3>
          {a && <StatusDonut totals={a.totals} />}
        </div>
      </div>

      <div className="dash-grid mt-2">
        <div className="card">
          <div className="flex between items-center mb-2">
            <h3 className="mb-0">{t('Recent invoices')}</h3>
            {useReal ? <button className="link-btn" onClick={() => setTab('invoices')}>{t('View all')} →</button> : <span className="muted" style={{ fontSize: 13 }}>{t('Today')}</span>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Invoice')}</th><th>{t('Customer')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('Time')}</th></tr></thead>
              <tbody>
                {useReal ? realInv.slice(0, 8).map((r) => (
                  <tr key={r.id} className="row-click" onClick={() => setOpenInv(r)}>
                    <td><strong dir="ltr">{r.id}</strong></td><td>{r.customerName}</td><td>{formatMoney(r.total)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted">{fmtTime(r.createdAt, locale)}</td>
                  </tr>
                )) : a?.recent.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong></td><td>{r.customer}</td><td>{formatMoney(r.amount)}</td>
                    <td><span className={`badge ${statusBadge[r.status]}`}>{t(r.status)}</span></td>
                    <td className="muted">{fmtTime(r.time, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!s ? (
          <div className="card no-plan">
            <h3>{t('No active package')}</h3>
            <p>{t('The statistics on this page are sample data. Choose a package to start sending real e-invoices.')}</p>
            <Link to="/packages" className="btn btn-primary mt-2">{t('Choose a package')}</Link>
          </div>
        ) : (
        <div className="card">
          <div className="flex between items-center mb-2">
            <h3 className="mb-0">{t('{name} plan', { name: t(s.packageName) })}</h3>
            <span className="badge green">{t(s.status)}</span>
          </div>
          <div className="flex gap-2 items-center">
            <Ring used={s.transactionsUsed} total={s.transactionsLimit} />
            <div style={{ flex: 1 }}>
              <div className="usage-line"><span>{t('Invoices')}</span><b dir="ltr">{s.transactionsUsed.toLocaleString()} / {s.transactionsLimit.toLocaleString()}</b></div>
              <div className="usage-line"><span>{t('Remaining')}</span><b>{remaining.toLocaleString()}</b></div>
              <div className="usage-line"><span>{t('Users')}</span><b dir="ltr">{team} / {s.usersLimit}</b></div>
              <div className="usage-line"><span>{t('Renews in')}</span><b>{t('{n} days', { n: dl })}</b></div>
            </div>
          </div>
          {remaining / s.transactionsLimit < 0.2 && (
            <div className="alert warn mt-2"><AlertTriangle size={16} /> {t('Running low on invoices. Add more or upgrade.')}</div>
          )}
          {can('billing') && <div className="flex gap-1 wrap mt-2">
            <button className="btn btn-primary btn-sm" onClick={() => setTab('plan')}><ArrowUpCircle size={15} /> {t('Upgrade')}</button>
            <Link to="/packages#addons" className="btn btn-outline btn-sm"><PackagePlus size={15} /> {t('Add-on')}</Link>
            <button className="btn btn-outline btn-sm" onClick={() => setTab('plan')}><RefreshCcw size={15} /> {t('Renew')}</button>
          </div>}
        </div>
        )}
      </div>

      <div className="mt-2"><Checklist steps={steps} progress={progress} compact /></div>
      <InvoiceDetail inv={openInv && realInv.find((i) => i.id === openInv.id)} onClose={() => setOpenInv(null)} userId={user.id} canAct={can('invoices.create')} />
    </>
  );
}

function Checklist({ steps, progress, compact }) {
  const { t, locale } = useLang();
  return (
    <div className="card">
      <div className="flex between items-center mb-1">
        <h3 className="mb-0">{t('Getting started')}</h3>
        <span className="muted" style={{ fontSize: 13 }}>{t('{n} of {total} done', { n: progress, total: steps.length })}</span>
      </div>
      <div className="progress mb-2"><div style={{ width: `${(progress / steps.length) * 100}%`, background: '#16a34a' }} /></div>
      <div className={compact ? 'checklist-row' : ''}>
        {steps.map((st, i) => (
          <div className="checklist-item" key={st.t}>
            <span className={`dot ${st.done ? 'done' : ''}`}>{st.done ? <CheckCircle2 size={16} /> : i + 1}</span>
            <div className="grow"><h4>{t(st.t)}</h4></div>
            {!st.done && st.action}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Users ================= */
function TeamUsers({ user, onSaved, setTab }) {
  const { t, locale } = useLang();
  const { member } = useAuth();
  const [f, setF] = useState({ name: '', email: '', role: 'Accountant' });
  const roleOpts = ROLES;
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = user.subscription?.usersLimit || 0;
  const team = user.teamUsers || [];
  const activeCount = 1 + team.filter((m) => m.status === 'Active').length;
  const setMember = (id, patch) => updateUser(user.id, (u) => ({ teamUsers: (u.teamUsers || []).map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const removeMember = (id) => updateUser(user.id, (u) => ({ teamUsers: (u.teamUsers || []).filter((m) => m.id !== id) }));
  const pending = user.subscription?.pendingChange ? getPackage(user.subscription.pendingChange.packageId) : null;
  const overAfterChange = pending && activeCount > pending.users;

  const add = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.name || !/^\S+@\S+\.\S+$/.test(f.email)) { setError('Enter a name and a valid email.'); return; }
    setBusy(true);
    try { const res = await addTeamUser(user.id, f); const { _tempPassword, ...u } = res; onSaved(u); setInvite({ email: f.email, password: _tempPassword }); setF({ name: '', email: '', role: 'Accountant' }); }
    catch (er) { setError(er); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="flex between items-center mb-2">
        <h3 className="mb-0">{t('Users')}</h3>
        <span className={`badge ${activeCount > limit ? 'red' : 'blue'}`} dir="ltr">{activeCount} / {limit}</span>
      </div>
      {(activeCount > limit || overAfterChange) && (
        <div className="alert error mb-2"><AlertTriangle size={18} />
          <span>{activeCount > limit
            ? t('Package allows {max} users. You currently have {n} active users. Deactivate {extra} user(s) or upgrade your package.', { max: limit, n: activeCount, extra: activeCount - limit })
            : t('Your plan switches to {name}, which allows {max} users. Deactivate {extra} user(s) before the change.', { name: t(pending.name), max: pending.users, extra: activeCount - pending.users })}</span>
        </div>
      )}
      <div className="table-wrap mb-2">
        <table>
          <thead><tr><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            <tr><td>{user.fullName} {!member && t('(You)')}</td><td>{user.email}</td><td><span className="badge orange">{t('Manager')} · {t('owner')}</span></td><td><span className="badge green">{t('Active')}</span></td><td /></tr>
            {team.map((m) => (
              <tr key={m.id} className={m.status !== 'Active' ? 'row-muted' : ''}>
                <td>{m.name} {member?.id === m.id && t('(You)')}</td><td dir="ltr">{m.email}</td>
                <td>
                  <select className="input input-sm" disabled={member?.id === m.id} value={normalizeRole(m.role)} onChange={(e) => setMember(m.id, { role: e.target.value })} aria-label={t('Role')}>
                    {TEAM_ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                  </select>
                </td>
                <td><span className={`badge ${m.status === 'Active' ? 'green' : 'gray'}`}>{t(m.status)}</span></td>
                <td className="row-actions">{member?.id !== m.id && <>
                  {m.status === 'Active'
                    ? <button className="btn btn-outline btn-sm" onClick={() => setMember(m.id, { status: 'Inactive' })}>{t('Deactivate')}</button>
                    : <button className="btn btn-outline btn-sm" disabled={activeCount >= limit} onClick={() => setMember(m.id, { status: 'Active' })}>{t('Activate')}</button>}
                  <button className="icon-btn danger" onClick={() => removeMember(m.id)} aria-label={t('Remove')}><Trash2 size={15} /></button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!user.subscription ? (
        <div className="alert info"><AlertCircle size={18} /> {t('Buy a package to add users.')}</div>
      ) : (
        <form onSubmit={add} className="form-grid" noValidate>
          <div className="field"><label>{t('Name')}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>{t('Email')}</label><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field"><label>{t('Role')}</label>
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {TEAM_ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
            </select><span className="hint">{t(ROLE_HINT[f.role])}</span></div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={busy}><UserPlus size={16} /> {t('Add user')}</button>
          </div>
          {error && (
            <div className="alert warn full field" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AlertTriangle size={18} /> <span style={{ flex: 1 }}>{errText(t, error)}</span>
              {error.key?.startsWith('Your package allows') && <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab('plan')}>{t('Upgrade plan')}</button>}
            </div>
          )}
        </form>
      )}
      {invite && (
        <div className="alert success mt-2" style={{ alignItems: 'flex-start' }}>
          <KeyRound size={18} />
          <div style={{ flex: 1 }}>
            <b>{t('User added. Share these sign-in details:')}</b>
            <div dir="ltr" style={{ fontFamily: 'monospace', marginTop: 4 }}>{invite.email} · {invite.password}</div>
            <small className="muted">{t('Demo only: a real system emails an invitation link instead.')}</small>
          </div>
          <button className="ab-close" onClick={() => setInvite(null)} aria-label={t('Close')}>×</button>
        </div>
      )}

      <h4 className="mt-3">{t('What each role can do')}</h4>
      <div className="table-wrap">
        <table className="perm-table">
          <thead><tr><th>{t('Permission')}</th>{ROLES.map((r) => <th key={r}>{t(r)}</th>)}</tr></thead>
          <tbody>
            {PERMISSIONS.filter((p) => !p.phase2 || feature('customerInvoicing')).map((p) => (
              <tr key={p.id}>
                <td>{t(p.label)}</td>
                {ROLES.map((r) => <td key={r}>{p.roles.includes(r) ? (p.view?.includes(r) ? <span className="perm-lv view">{t('View')}</span> : <Check size={17} className="perm-yes" aria-label={t('Yes')} />) : <Minus size={17} className="perm-no" aria-label={t('No')} />}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Page ================= */
const NAV_GROUPS = [
  { label: 'My account', items: [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview', perm: 'dashboard' },
    { id: 'journey', icon: Route, label: 'Onboarding & linking', perm: 'usage' },
    { id: 'usage', icon: Gauge, label: 'Usage', perm: 'usage' },
    { id: 'invoices-model', icon: Receipt, label: 'Model invoices', perm: 'modelInvoices' },
    { id: 'plan', icon: CreditCard, label: 'Plan & billing', perm: 'billing' },
    { id: 'consulting', icon: GraduationCap, label: 'Consulting', perm: 'support' },
    { id: 'support', icon: LifeBuoy, label: 'Support', perm: 'support' },
  ] },
  { label: 'Company', items: [
    { id: 'company', icon: Building2, label: 'Company', perm: 'company' },
    { id: 'users', icon: Users, label: 'Users', perm: 'users' },
    { id: 'api', icon: KeyRound, label: 'API keys', perm: 'api' },
    { id: 'security', icon: ShieldCheck, label: 'Security & terms', perm: 'dashboard' },
  ] },
  { label: 'Invoicing (phase 2)', phase2: true, items: [
    { id: 'invoicing', icon: Activity, label: 'Invoicing overview', perm: 'dashboard' },
    { id: 'invoices', icon: FileText, label: 'Invoices', perm: 'dashboard' },
    { id: 'reports', icon: BarChart3, label: 'Reports', perm: 'reports' },
    { id: 'customers', icon: BookUser, label: 'Customers', perm: 'dashboard' },
    { id: 'categories', icon: Tags, label: 'Categories', perm: 'dashboard' },
    { id: 'items', icon: PackageIcon, label: 'Items', perm: 'dashboard' },
  ] },
];

export default function Dashboard() {
  const { t, locale } = useLang();
  const { user, logout, refreshUser, can, me, member, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  useDbVersion();
  const invoicingOn = feature('customerInvoicing');
  const groups = NAV_GROUPS.filter((g) => !g.phase2 || invoicingOn).map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length);
  const allowed = groups.flatMap((g) => g.items);
  const asked = params.get('tab') === 'master' ? 'customers' : params.get('tab') === 'addon' ? 'usage' : params.get('tab'); // old links
  const tab = allowed.some((n) => n.id === asked) ? asked : 'overview';
  const setTab = (id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: false });
  const flash = location.state?.flash;

  // Fill in sample statistics for accounts that bought a package before they existed.
  useEffect(() => {
    const updated = ensureActivity(user.id);
    if (updated) refreshUser(updated);
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dash">
      <aside className="dash-side">
        {groups.map((g) => (
          <div key={g.label} className="side-group">
            <div className="side-label">{t(g.label)}</div>
            {g.items.map(({ id, icon: Icon, label }) => (
              <a key={id} href={`?tab=${id}`} data-tab={id} className={tab === id ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(id); }}>
                <Icon size={18} /> {t(label)}
              </a>
            ))}
          </div>
        ))}
        <div className="side-sep" />
        <button className="link" onClick={() => { logout(); navigate('/'); }}><LogOut size={18} /> {t('Logout')}</button>
      </aside>

      <main className="dash-main">
        <div className="flex between items-center wrap gap-2 mb-3">
          <div>
            <h1 style={{ fontSize: 26 }}>{t('Welcome, {name}', { name: me.name.split(' ')[0] })} 👋</h1>
            <p className="muted mb-0">{user.company?.name || t('Complete the steps below to start invoicing.')}{member && <> · <span className="role-chip" style={{ marginTop: 0 }}>{t(role)}</span></>}</p>
          </div>
          <div className="flex items-center gap-1 wrap">
            <span className={`badge ${STAGE_BADGE[stageOf(user)]}`}>{t(stageOf(user))}</span>
            {invoicingOn && <InvoicesLeftPill />}
            <PortalButton user={user} />
          </div>
          <div className="dash-tabs">
            {allowed.map(({ id, label }) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t(label)}</button>
            ))}
          </div>
        </div>

        {flash && <div className="alert success mb-2"><CheckCircle2 size={18} /> {typeof flash === 'string' ? t(flash) : t(flash.key, { ...flash.vars, name: t(flash.vars?.name), ...(flash.dateVar ? { [flash.dateVar]: fmtDate(flash.vars[flash.dateVar], locale) } : {}) })}</div>}

        <AlertBanner />
        <TermsGate user={user} />

        {tab === 'overview' && <PortalOverview user={user} setTab={setTab} />}
        {tab === 'invoicing' && <Overview user={user} setTab={setTab} />}
        {tab === 'journey' && <Journey user={user} />}
        {tab === 'usage' && <Usage user={user} />}
        {tab === 'invoices-model' && <ModelInvoices user={user} />}
        {tab === 'consulting' && <Consulting user={user} />}
        {tab === 'security' && <Security user={user} />}
        {tab === 'api' && <ApiKeys user={user} />}
        {tab === 'invoices' && <Invoices setTab={setTab} />}
        {tab === 'customers' && <MasterData key="customers" page="customers" />}
        {tab === 'categories' && <MasterData key="categories" page="categories" />}
        {tab === 'items' && <MasterData key="items" page="items" />}
        {tab === 'plan' && <PlanBilling user={user} onSaved={refreshUser} initialDowngrade={location.state?.downgradeTo} />}
        {tab === 'company' && <CompanyForm user={user} onSaved={refreshUser} />}
        {tab === 'users' && <TeamUsers user={user} onSaved={refreshUser} setTab={setTab} />}
        {tab === 'reports' && <CompanyReports />}
        {tab === 'support' && <CustomerSupport />}
      </main>
    </div>
  );
}
