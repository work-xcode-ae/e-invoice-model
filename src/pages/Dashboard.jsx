import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CreditCard, FileText, LogOut, CheckCircle2, PackagePlus,
  RefreshCcw, ArrowUpCircle, ArrowDownCircle, Loader2, AlertCircle, UserPlus, Send, Clock, AlertTriangle,
  TrendingUp, TrendingDown, CalendarClock, Receipt, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveCompany, addTeamUser, upgradeQuote, scheduleDowngrade, cancelPendingChange } from '../services/api';
import { packages, getPackage, formatMoney } from '../data/packages';
import { planAction } from '../data/planActions';
import { DailyChart, ChartLegend, StatusDonut, Sparkline } from '../components/DashboardCharts';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const daysLeft = (end) => Math.max(0, Math.ceil((new Date(end) - Date.now()) / 86400000));
const statusBadge = { Success: 'green', Processing: 'blue', Queued: 'orange', Failed: 'red' };

function Ring({ used, total }) {
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
      <div className="ring-label"><div><strong>{Math.round(pct * 100)}%</strong>used</div></div>
    </div>
  );
}

/* ================= Overview with statistics ================= */
function Overview({ user, setTab }) {
  const s = user.subscription;
  const a = user.activity;
  const team = 1 + (user.teamUsers?.length || 0);

  const steps = [
    { t: 'Choose & pay for a package', done: !!s, action: !s && <Link to="/packages" className="btn btn-primary btn-sm">Choose package</Link> },
    { t: 'Create your company', done: !!user.company, action: !user.company && <button className="btn btn-outline btn-sm" onClick={() => setTab('company')}>Add company</button> },
    { t: 'Add users', done: team > 1, action: team === 1 && <button className="btn btn-outline btn-sm" onClick={() => setTab('users')}>Add</button> },
    { t: 'Link with EmaraTax', done: false },
  ];
  const progress = steps.filter((x) => x.done).length;

  if (!s) {
    return (
      <div className="grid grid-2">
        <div className="card">
          <h3>No active package</h3>
          <p>Choose a package to start sending e-invoices. Your statistics will appear here.</p>
          <Link to="/packages" className="btn btn-primary mt-2">Choose a package</Link>
        </div>
        <Checklist steps={steps} progress={progress} />
      </div>
    );
  }

  const last7 = a ? a.days.slice(7) : [];
  const prev7 = a ? a.days.slice(0, 7) : [];
  const sum = (arr, k) => arr.reduce((x, d) => x + d[k], 0);
  const week = sum(last7, 'sent'), prevWeek = sum(prev7, 'sent');
  const delta = prevWeek ? Math.round(((week - prevWeek) / prevWeek) * 100) : 0;
  const successRate = a ? ((a.totals.sent / (a.totals.sent + a.totals.failed)) * 100).toFixed(1) : '0';
  const failedWeek = sum(last7, 'failed');
  const remaining = s.transactionsLimit - s.transactionsUsed;
  const dl = daysLeft(s.endDate);

  const kpis = [
    { icon: Send, c: '', label: 'Sent this week', value: week.toLocaleString(), delta, spark: a?.days.map((d) => d.sent), color: '#3b82f6' },
    { icon: CheckCircle2, c: 'green', label: 'Success rate', value: `${successRate}%`, note: 'last 14 days', spark: a?.days.map((d) => d.sent - d.failed), color: '#16a34a' },
    { icon: AlertTriangle, c: 'red', label: 'Failed this week', value: failedWeek, note: 'auto-retried every 5–10 min', spark: a?.days.map((d) => d.failed), color: '#ef4444' },
    { icon: Clock, c: 'orange', label: 'In queue now', value: a?.totals.queued ?? 0, note: `${a?.totals.processing ?? 0} processing` },
  ];

  return (
    <>
      <div className="demo-note"><AlertCircle size={14} /> Sample data. Live figures will appear here once the invoicing backend is connected.</div>

      <div className="kpi-grid">
        {kpis.map(({ icon: Icon, c, label, value, delta: d, note, spark, color }) => (
          <div className="card kpi2" key={label}>
            <div className="flex between items-center">
              <span className={`icon-box mb-0 ${c}`} style={{ width: 36, height: 36 }}><Icon size={18} /></span>
              {spark && <Sparkline values={spark} color={color} />}
            </div>
            <span className="kpi2-label">{label}</span>
            <strong className="kpi2-value">{value}</strong>
            {d !== undefined ? (
              <span className={`kpi2-delta ${d >= 0 ? 'up' : 'down'}`}>
                {d >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(d)}% vs last week
              </span>
            ) : <span className="kpi2-note">{note}</span>}
          </div>
        ))}
      </div>

      <div className="dash-grid mt-2">
        <div className="card">
          <div className="flex between items-center wrap gap-1 mb-2">
            <div><h3 className="mb-0">Invoices per day</h3><span className="muted" style={{ fontSize: 13 }}>Last 14 days</span></div>
            <ChartLegend />
          </div>
          {a && <DailyChart days={a.days} />}
        </div>
        <div className="card">
          <h3>Status breakdown</h3>
          {a && <StatusDonut totals={a.totals} />}
        </div>
      </div>

      <div className="dash-grid mt-2">
        <div className="card">
          <div className="flex between items-center mb-2">
            <h3 className="mb-0">Recent invoices</h3>
            <span className="muted" style={{ fontSize: 13 }}>Today</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {a?.recent.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong></td><td>{r.customer}</td><td>{formatMoney(r.amount)}</td>
                    <td><span className={`badge ${statusBadge[r.status]}`}>{r.status}</span></td>
                    <td className="muted">{fmtTime(r.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="flex between items-center mb-2">
            <h3 className="mb-0">{s.packageName} plan</h3>
            <span className="badge green">{s.status}</span>
          </div>
          <div className="flex gap-2 items-center">
            <Ring used={s.transactionsUsed} total={s.transactionsLimit} />
            <div style={{ flex: 1 }}>
              <div className="usage-line"><span>Invoices</span><b>{s.transactionsUsed.toLocaleString()} / {s.transactionsLimit.toLocaleString()}</b></div>
              <div className="usage-line"><span>Remaining</span><b>{remaining.toLocaleString()}</b></div>
              <div className="usage-line"><span>Users</span><b>{team} / {s.usersLimit}</b></div>
              <div className="usage-line"><span>Renews in</span><b>{dl} days</b></div>
            </div>
          </div>
          {remaining / s.transactionsLimit < 0.2 && (
            <div className="alert warn mt-2"><AlertTriangle size={16} /> Running low on invoices. Add more or upgrade.</div>
          )}
          <div className="flex gap-1 wrap mt-2">
            <button className="btn btn-primary btn-sm" onClick={() => setTab('plan')}><ArrowUpCircle size={15} /> Upgrade</button>
            <Link to="/packages#addons" className="btn btn-outline btn-sm"><PackagePlus size={15} /> Add-on</Link>
            <button className="btn btn-outline btn-sm" onClick={() => setTab('plan')}><RefreshCcw size={15} /> Renew</button>
          </div>
        </div>
      </div>

      <div className="mt-2"><Checklist steps={steps} progress={progress} compact /></div>
    </>
  );
}

function Checklist({ steps, progress, compact }) {
  return (
    <div className="card">
      <div className="flex between items-center mb-1">
        <h3 className="mb-0">Getting started</h3>
        <span className="muted" style={{ fontSize: 13 }}>{progress} of {steps.length} done</span>
      </div>
      <div className="progress mb-2"><div style={{ width: `${(progress / steps.length) * 100}%`, background: '#16a34a' }} /></div>
      <div className={compact ? 'checklist-row' : ''}>
        {steps.map((st, i) => (
          <div className="checklist-item" key={st.t}>
            <span className={`dot ${st.done ? 'done' : ''}`}>{st.done ? <CheckCircle2 size={16} /> : i + 1}</span>
            <div className="grow"><h4>{st.t}</h4></div>
            {!st.done && st.action}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Plan & billing ================= */
function PlanBilling({ user, onSaved, initialDowngrade }) {
  const { setCart } = useAuth();
  const navigate = useNavigate();
  const s = user.subscription;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(initialDowngrade || null);

  if (!s) {
    return (
      <div className="card">
        <h3>No active package</h3>
        <p>Choose a package to get started.</p>
        <Link to="/packages" className="btn btn-primary mt-2">View packages</Link>
      </div>
    );
  }

  const current = getPackage(s.packageId);
  const doUpgrade = (pkg) => {
    const q = upgradeQuote(s, pkg.id);
    setCart({ type: 'upgrade', packageId: pkg.id, price: q.amount, remainingDays: q.remainingDays });
    navigate('/cart');
  };
  const doRenew = (months = 1) => { setCart({ type: 'package', packageId: s.packageId, months }); navigate('/cart'); };
  const doDowngrade = async (pkg) => {
    setBusy(pkg.id); setError('');
    try { onSaved(await scheduleDowngrade(user.id, pkg.id)); setConfirm(null); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };
  const undo = async () => { setBusy('undo'); onSaved(await cancelPendingChange(user.id)); setBusy(null); };

  return (
    <>
      <div className="plan-hero card">
        <div>
          <span className="plan-eyebrow">Current plan</span>
          <h2 className="mb-0">{s.packageName} <span className="badge green" style={{ verticalAlign: 'middle' }}>{s.status}</span></h2>
          <p className="mb-0">{formatMoney(current.price)} / month · {current.transactions.toLocaleString()} invoices/mo · {current.users} users</p>
        </div>
        <div className="plan-dates">
          <div><span>Started</span><b>{fmtDate(s.startDate)}</b></div>
          <div><span>Renews / ends</span><b>{fmtDate(s.endDate)}</b></div>
          <div><span>Days left</span><b>{daysLeft(s.endDate)}</b></div>
        </div>
        <div className="flex gap-1 wrap">
          <button className="btn btn-white" onClick={() => doRenew(1)}><RefreshCcw size={16} /> Renew 1 month</button>
          <button className="btn btn-ghost-light" onClick={() => doRenew(3)}>Renew 3 months · save 17%</button>
        </div>
      </div>

      {s.pendingChange && (
        <div className="alert info mt-2" style={{ alignItems: 'center' }}>
          <CalendarClock size={18} />
          <span style={{ flex: 1 }}>Your plan switches to <b>{s.pendingChange.packageName}</b> on <b>{fmtDate(s.pendingChange.effectiveDate)}</b>.</span>
          <button className="btn btn-outline btn-sm" onClick={undo} disabled={busy === 'undo'}><X size={14} /> Cancel change</button>
        </div>
      )}
      {error && <div className="alert error mt-2"><AlertCircle size={18} /> <span style={{ flex: 1 }}>{error}</span> <button className="btn btn-outline btn-sm" onClick={() => document.querySelector('[data-tab=users]')?.click()}>Manage users</button></div>}

      <h3 className="mt-3">Change plan</h3>
      <div className="plan-options">
        {packages.map((pkg) => {
          const act = planAction(s, pkg);
          const q = act === 'upgrade' ? upgradeQuote(s, pkg.id) : null;
          const isPending = s.pendingChange?.packageId === pkg.id;
          return (
            <div key={pkg.id} className={`plan-opt ${act === 'renew' ? 'is-current' : ''} ${act === 'upgrade' ? 'is-up' : ''}`}>
              <div className="flex between items-center">
                <strong className="plan-opt-name">{pkg.name}</strong>
                {act === 'renew' && <span className="badge blue">Current</span>}
                {act === 'upgrade' && <span className="badge green"><ArrowUpCircle size={12} /> Upgrade</span>}
                {act === 'downgrade' && <span className="badge gray"><ArrowDownCircle size={12} /> Downgrade</span>}
              </div>
              <div className="plan-opt-price">{formatMoney(pkg.price)}<span>/mo</span></div>
              <ul>
                <li><b>{pkg.transactions.toLocaleString()}</b> invoices / month <Diff a={pkg.transactions} b={current.transactions} /></li>
                <li><b>{pkg.users}</b> users <Diff a={pkg.users} b={current.users} /></li>
                <li>{pkg.support}</li>
              </ul>

              {act === 'upgrade' && (
                <>
                  <div className="plan-opt-note">Pay <b>{formatMoney(q.amount)}</b> now, prorated for {q.remainingDays} days. Applies immediately.</div>
                  <button className="btn btn-primary btn-block" onClick={() => doUpgrade(pkg)}>Upgrade to {pkg.name}</button>
                </>
              )}
              {act === 'renew' && (
                <>
                  <div className="plan-opt-note">You're on this plan.</div>
                  <button className="btn btn-outline btn-block" onClick={() => doRenew(1)}>Renew</button>
                </>
              )}
              {act === 'downgrade' && (
                isPending ? (
                  <div className="plan-opt-note">Scheduled for {fmtDate(s.pendingChange.effectiveDate)}.</div>
                ) : confirm === pkg.id ? (
                  <>
                    <div className="plan-opt-note warn">Switches on {fmtDate(s.endDate)}. Max {pkg.users} users, {pkg.transactions} invoices/mo.</div>
                    <div className="flex gap-1">
                      <button className="btn btn-dark btn-sm" style={{ flex: 1 }} onClick={() => doDowngrade(pkg)} disabled={busy === pkg.id}>
                        {busy === pkg.id ? <Loader2 size={14} className="spin" /> : 'Confirm'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>Back</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="plan-opt-note">Applies from your next billing period.</div>
                    <button className="btn btn-outline btn-block" onClick={() => setConfirm(pkg.id)}>Switch to {pkg.name}</button>
                  </>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="card mt-3">
        <div className="flex between items-center mb-2">
          <h3 className="mb-0">Billing history</h3>
          <Link to="/packages#addons" className="btn btn-outline btn-sm"><PackagePlus size={14} /> Buy add-on</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Payment ID</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {(user.payments || []).slice().reverse().map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.date)}</td><td>{p.description}</td><td className="muted"><code>{p.id}</code></td>
                  <td><b>{formatMoney(p.total)}</b></td><td><span className="badge green"><Receipt size={12} /> {p.status}</span></td>
                </tr>
              ))}
              {!(user.payments || []).length && <tr><td colSpan="5" className="muted">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const Diff = ({ a, b }) => (a === b ? null : <span className={`diff ${a > b ? 'up' : 'down'}`}>{a > b ? '+' : '−'}{Math.abs(a - b).toLocaleString()}</span>);

/* ================= Company ================= */
function CompanyForm({ user, onSaved }) {
  const [f, setF] = useState(user.company || { name: '', tradeLicense: '', trn: '', emirate: 'Dubai', address: '' });
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = 'Required';
    if (!f.tradeLicense.trim()) er.tradeLicense = 'Required';
    if (!/^\d{15}$/.test(f.trn)) er.trn = 'TRN must be 15 digits';
    setErr(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    const u = await saveCompany(user.id, f);
    setSaving(false); setOk(true);
    onSaved(u);
  };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h3>Company details</h3>
      <p className="mb-2">This information is used on your invoices and for EmaraTax linking.</p>
      {ok && <div className="alert success mb-2"><CheckCircle2 size={18} /> Company saved.</div>}
      <div className="form-grid">
        <div className="field full"><label>Company name *</label>
          <input className={`input ${err.name ? 'invalid' : ''}`} value={f.name} onChange={set('name')} placeholder="ABC Trading LLC" />
          {err.name && <span className="err">{err.name}</span>}</div>
        <div className="field"><label>Trade licence number *</label>
          <input className={`input ${err.tradeLicense ? 'invalid' : ''}`} value={f.tradeLicense} onChange={set('tradeLicense')} placeholder="1234567" />
          {err.tradeLicense && <span className="err">{err.tradeLicense}</span>}</div>
        <div className="field"><label>TRN *</label>
          <input className={`input ${err.trn ? 'invalid' : ''}`} value={f.trn} onChange={set('trn')} placeholder="100XXXXXXXXXXXX" inputMode="numeric" />
          {err.trn && <span className="err">{err.trn}</span>}</div>
        <div className="field"><label>Emirate</label>
          <select className="input" value={f.emirate} onChange={set('emirate')}>
            {['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'].map((x) => <option key={x}>{x}</option>)}
          </select></div>
        <div className="field"><label>Address</label>
          <input className="input" value={f.address} onChange={set('address')} placeholder="Office, building, area" /></div>
      </div>
      <button className="btn btn-primary mt-3" disabled={saving}>
        {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : user.company ? 'Update company' : 'Create company'}
      </button>
    </form>
  );
}

/* ================= Users ================= */
function TeamUsers({ user, onSaved, setTab }) {
  const [f, setF] = useState({ name: '', email: '', role: 'User' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = user.subscription?.usersLimit || 0;
  const team = user.teamUsers || [];

  const add = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.name || !/^\S+@\S+\.\S+$/.test(f.email)) { setError('Enter a name and a valid email.'); return; }
    setBusy(true);
    try { onSaved(await addTeamUser(user.id, f)); setF({ name: '', email: '', role: 'User' }); }
    catch (er) { setError(er.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="flex between items-center mb-2">
        <h3 className="mb-0">Users</h3>
        <span className="badge blue">{1 + team.length} / {limit} users</span>
      </div>
      <div className="table-wrap mb-2">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>{user.fullName} (You)</td><td>{user.email}</td><td><span className="badge orange">Owner</span></td><td><span className="badge green">Active</span></td></tr>
            {team.map((m) => (
              <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{m.role}</td><td><span className="badge green">{m.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {!user.subscription ? (
        <div className="alert info"><AlertCircle size={18} /> Buy a package to add users.</div>
      ) : (
        <form onSubmit={add} className="form-grid" noValidate>
          <div className="field"><label>Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>Email</label><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field"><label>Role</label>
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option>User</option><option>Admin</option><option>Accountant</option><option>Viewer</option>
            </select></div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={busy}><UserPlus size={16} /> Add user</button>
          </div>
          {error && (
            <div className="alert warn full field" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AlertTriangle size={18} /> <span style={{ flex: 1 }}>{error}</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab('plan')}>Upgrade plan</button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

/* ================= Page ================= */
const NAV = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { id: 'plan', icon: CreditCard, label: 'Plan & billing' },
  { id: 'company', icon: Building2, label: 'Company' },
  { id: 'users', icon: Users, label: 'Users' },
];

export default function Dashboard() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = NAV.some((n) => n.id === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: false });
  const flash = location.state?.flash;

  return (
    <div className="dash">
      <aside className="dash-side">
        {NAV.map(({ id, icon: Icon, label }) => (
          <a key={id} href={`?tab=${id}`} data-tab={id} className={tab === id ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(id); }}>
            <Icon size={18} /> {label}
          </a>
        ))}
        <a href="#invoices" onClick={(e) => e.preventDefault()} style={{ opacity: .5 }} title="Coming next"><FileText size={18} /> Invoices</a>
        <button className="link" onClick={() => { logout(); navigate('/'); }}><LogOut size={18} /> Logout</button>
      </aside>

      <main className="dash-main">
        <div className="flex between items-center wrap gap-2 mb-3">
          <div>
            <h1 style={{ fontSize: 26 }}>Welcome, {user.fullName.split(' ')[0]} 👋</h1>
            <p className="muted mb-0">{user.company?.name || 'Complete the steps below to start invoicing.'}</p>
          </div>
          <div className="dash-tabs">
            {NAV.map(({ id, label }) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>

        {flash && <div className="alert success mb-2"><CheckCircle2 size={18} /> {flash}</div>}

        {tab === 'overview' && <Overview user={user} setTab={setTab} />}
        {tab === 'plan' && <PlanBilling user={user} onSaved={refreshUser} initialDowngrade={location.state?.downgradeTo} />}
        {tab === 'company' && <CompanyForm user={user} onSaved={refreshUser} />}
        {tab === 'users' && <TeamUsers user={user} onSaved={refreshUser} setTab={setTab} />}
      </main>
    </div>
  );
}
