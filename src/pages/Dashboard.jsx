import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CreditCard, FileText, LogOut, CheckCircle2, PackagePlus,
  RefreshCcw, ArrowUpCircle, Loader2, AlertCircle, UserPlus, Send, Clock, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveCompany, addTeamUser } from '../services/api';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function Ring({ used, total }) {
  const r = 52; const c = 2 * Math.PI * r;
  const pct = total ? Math.min(used / total, 1) : 0;
  return (
    <div className="ring">
      <svg width="120" height="120">
        <circle cx="60" cy="60" r={r} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle cx="60" cy="60" r={r} stroke={pct > .9 ? '#dc2626' : '#16a34a'} strokeWidth="10" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" />
      </svg>
      <div className="ring-label"><div><strong>{used} / {total}</strong>Used</div></div>
    </div>
  );
}

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

function TeamUsers({ user, onSaved }) {
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
          {error && <div className="alert warn full field"><AlertTriangle size={18} /> {error}</div>}
        </form>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('overview');
  const flash = location.state?.flash;
  const s = user.subscription;

  const steps = [
    { t: 'Create account', d: 'Your account is ready.', done: true },
    { t: 'Choose & pay for a package', d: s ? `${s.packageName} package is active.` : 'Pick a package that fits your volume.', done: !!s, action: !s && <Link to="/packages" className="btn btn-primary btn-sm">Choose package</Link> },
    { t: 'Create your company', d: user.company ? user.company.name : 'Add company name, trade licence and TRN.', done: !!user.company, action: !user.company && <button className="btn btn-outline btn-sm" onClick={() => setTab('company')}>Add company</button> },
    { t: 'Add users', d: `${1 + (user.teamUsers?.length || 0)} user(s) in your account.`, done: (user.teamUsers?.length || 0) > 0, action: <button className="btn btn-outline btn-sm" onClick={() => setTab('users')}>Manage</button> },
    { t: 'Link with EmaraTax', d: 'Select Model E-Invoice in EmaraTax to get your Peppol ID.', done: false },
    { t: 'Ready to invoice', d: 'Create invoices manually, by Excel or by API.', done: false },
  ];

  const nav = [
    { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'company', icon: Building2, label: 'Company' },
    { id: 'users', icon: Users, label: 'Users' },
  ];

  return (
    <div className="dash">
      <aside className="dash-side">
        {nav.map(({ id, icon: Icon, label }) => (
          <a key={id} href={`#${id}`} className={tab === id ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(id); }}>
            <Icon size={18} /> {label}
          </a>
        ))}
        <Link to="/packages"><CreditCard size={18} /> Packages</Link>
        <a href="#invoices" onClick={(e) => e.preventDefault()} style={{ opacity: .5 }} title="Coming next"><FileText size={18} /> Invoices</a>
        <button className="link" onClick={() => { logout(); navigate('/'); }}><LogOut size={18} /> Logout</button>
      </aside>

      <main className="dash-main">
        <div className="flex between items-center wrap gap-2 mb-3">
          <div>
            <h1 style={{ fontSize: 26 }}>Welcome, {user.fullName.split(' ')[0]} 👋</h1>
            <p className="muted mb-0">{user.company?.name || 'Complete the steps below to start invoicing.'}</p>
          </div>
          <div className="flex gap-1 wrap" style={{ display: 'flex' }}>
            {nav.map(({ id, label }) => (
              <button key={id} className={`btn btn-sm ${tab === id ? 'btn-dark' : 'btn-outline'}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>

        {flash && <div className="alert success mb-2"><CheckCircle2 size={18} /> {flash}</div>}

        {tab === 'overview' && (
          <>
            <div className="grid grid-4 mb-3">
              {[
                { icon: Send, c: '', l: 'Invoices sent', v: s?.transactionsUsed ?? 0 },
                { icon: Clock, c: 'orange', l: 'In queue', v: 0 },
                { icon: AlertTriangle, c: 'red', l: 'Failed', v: 0 },
                { icon: Users, c: 'green', l: 'Users', v: `${1 + (user.teamUsers?.length || 0)} / ${s?.usersLimit ?? '-'}` },
              ].map(({ icon: Icon, c, l, v }) => (
                <div className="card kpi" key={l}><div className={`icon-box ${c}`}><Icon size={20} /></div><div><span>{l}</span><strong>{v}</strong></div></div>
              ))}
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="flex between items-center mb-2">
                  <h3 className="mb-0">Subscription</h3>
                  {s ? <span className="badge green">{s.status}</span> : <span className="badge gray">No package</span>}
                </div>
                {s ? (
                  <>
                    <div className="flex gap-2 items-center wrap">
                      <Ring used={s.transactionsUsed} total={s.transactionsLimit} />
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div className="summary-row"><span>Package</span><strong>{s.packageName}</strong></div>
                        <div className="summary-row"><span>Start date</span><span>{fmtDate(s.startDate)}</span></div>
                        <div className="summary-row"><span>End date</span><span>{fmtDate(s.endDate)}</span></div>
                        <div className="summary-row"><span>Users allowed</span><span>{s.usersLimit}</span></div>
                      </div>
                    </div>
                    <div className="flex gap-1 wrap mt-2">
                      <Link to="/packages#addons" className="btn btn-outline btn-sm"><PackagePlus size={15} /> Buy add-on</Link>
                      <Link to="/packages" className="btn btn-outline btn-sm"><RefreshCcw size={15} /> Renew</Link>
                      <Link to="/packages" className="btn btn-outline btn-sm"><ArrowUpCircle size={15} /> Upgrade</Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p>You don’t have an active package yet. Choose one to start sending e-invoices.</p>
                    <Link to="/packages" className="btn btn-primary mt-2">Choose a package</Link>
                  </>
                )}
              </div>

              <div className="card">
                <h3>Getting started</h3>
                {steps.map((st, i) => (
                  <div className="checklist-item" key={st.t}>
                    <span className={`dot ${st.done ? 'done' : ''}`}>{st.done ? <CheckCircle2 size={16} /> : i + 1}</span>
                    <div className="grow"><h4>{st.t}</h4><p>{st.d}</p></div>
                    {!st.done && st.action}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'company' && <CompanyForm user={user} onSaved={refreshUser} />}
        {tab === 'users' && <TeamUsers user={user} onSaved={refreshUser} />}
      </main>
    </div>
  );
}
