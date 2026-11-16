// Model staff panel: tasks (ADM-02, ADM-03), staff & roles (ADM-01), owner dashboard (ADM-05), audit log (ADM-06).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, AlertTriangle, ArrowRightLeft, UserCog, Play, X, Plus, Shield, Search, TrendingUp, TrendingDown, Users, Building2, Receipt, Handshake, Target, ListChecks, Trash2, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { getTasks, startTask, completeTask, reassignTask, transferTask, addTaskNote, checkEscalations, releaseTasksOf, TASK_TYPES } from '../../services/tasks';
import { getStaff, STAFF_PERMS, roleMatrix, allRoleNames, addStaff, updateStaff, saveCustomRole, deleteCustomRole, DEFAULT_MATRIX, staffName } from '../../services/staff';
import { getAudit } from '../../services/audit';
import { allDocsWithCompany } from '../../services/modelDocs';
import { getUsers } from '../../services/api';
import { stageOf, STAGES } from '../../services/lifecycle';
import { getLeads } from '../../services/crm';
import { getCommissions } from '../../services/partners';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime, timeAgo } from '../../utils/format';

const isLate = (tk) => tk.status !== 'Done' && new Date(tk.dueAt) < new Date();
const refLink = (r) => (r?.kind === 'company' ? `/admin/onboarding?c=${(r.userId || r.id).split(':')[0]}` : r?.kind === 'lead' ? `/admin/crm?l=${r.id}` : r?.kind === 'partner' ? `/admin/partners?p=${r.id}` : r?.kind === 'order' ? '/admin/billing?tab=bank' : r?.kind === 'refund' ? '/admin/refunds' : r?.kind === 'statement' ? '/admin/partners?tab=statements' : r?.kind === 'integration' || r?.kind === 'doc' ? '/admin/integrations' : r?.kind === 'recon' ? '/admin/finance?tab=recon' : r?.kind === 'ad' ? '/admin/content?tab=ads' : null);

/* ====================== Tasks ====================== */
export function AdminTasks() {
  const { t, locale } = useLang();
  const { user, staffLevel } = useAuth();
  useDbVersion();
  useEffect(() => { checkEscalations(); }, []);
  const canAssign = staffLevel('assign') === 'full';
  const [scope, setScope] = useState(canAssign ? 'all' : 'mine');
  const [status, setStatus] = useState('open');
  const [team, setTeam] = useState('');
  const [open, setOpen] = useState(null);
  const all = getTasks();
  const list = all.filter((tk) => (scope === 'mine' ? tk.assigneeId === user.id : scope === 'late' ? isLate(tk) || tk.escalated : true)
    && (status === 'open' ? tk.status !== 'Done' : status === 'done' ? tk.status === 'Done' : true) && (!team || tk.team === team));
  const mine = all.filter((tk) => tk.assigneeId === user.id && tk.status !== 'Done');
  const late = all.filter((tk) => isLate(tk));
  const cur = open && all.find((x) => x.id === open);
  return (
    <>
      <PageTitle title="Tasks" sub="Every event creates a task. Tasks go to each team in turn, have a deadline in working hours and are escalated to the manager when late." />
      <div className="admin-kpis">
        {[[ListChecks, '', 'My open tasks', mine.length], [AlertTriangle, 'red', 'Late', late.length], [Shield, 'orange', 'Escalated', all.filter((x) => x.escalated && x.status !== 'Done').length], [CheckCircle2, 'green', 'Done this week', all.filter((x) => x.status === 'Done' && Date.now() - new Date(x.doneAt) < 7 * 86400000).length]].map(([Icon, c, l, v]) => (
          <div className="card kpi" key={l}><div className={`icon-box ${c}`}><Icon size={20} /></div><div><span>{t(l)}</span><strong>{v}</strong></div></div>
        ))}
      </div>
      <div className="flex gap-1 wrap mt-2 mb-2 items-center">
        <div className="subtabs" style={{ border: 0 }}>{[['mine', 'Mine'], ...(canAssign ? [['all', 'All']] : []), ['late', 'Late & escalated']].map(([k, l]) => <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{t(l)}</button>)}</div>
        <select className="input input-sm" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">{t('Open')}</option><option value="done">{t('Done')}</option><option value="all">{t('All')}</option></select>
        <select className="input input-sm" style={{ maxWidth: 200 }} value={team} onChange={(e) => setTeam(e.target.value)}><option value="">{t('All teams')}</option>{allRoleNames().filter((r) => r !== 'Owner').map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Task')}</th><th>{t('About')}</th><th>{t('Team')}</th><th>{t('Assigned to')}</th><th>{t('Due')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>
              {list.map((tk) => (
                <tr key={tk.id} className="row-click" onClick={() => setOpen(tk.id)}>
                  <td><b>{t(tk.title)}</b><small className="muted" style={{ display: 'block' }} dir="ltr">{tk.id}</small></td>
                  <td>{tk.ref?.name || '—'}</td>
                  <td>{t(tk.team)}</td>
                  <td>{staffName(tk.assigneeId)}</td>
                  <td className={isLate(tk) ? 'task-late' : ''}>{fmtDateTime(tk.dueAt, locale)}{tk.escalated && <span className="badge red" style={{ marginInlineStart: 6 }}>{t('Escalated')}</span>}</td>
                  <td><span className={`badge ${tk.status === 'Done' ? 'green' : tk.status === 'In progress' ? 'blue' : 'orange'}`}>{t(tk.status)}</span></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan="6" className="center muted" style={{ padding: 28 }}>{t('No tasks here.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {cur && <TaskDrawer tk={cur} onClose={() => setOpen(null)} canAssign={canAssign} />}
    </>
  );
}

function TaskDrawer({ tk, onClose, canAssign }) {
  const { t, locale } = useLang();
  const [note, setNote] = useState('');
  const [to, setTo] = useState('');
  const [team, setTeam] = useState('');
  const [err, setErr] = useState('');
  const link = refLink(tk.ref);
  const act = (fn) => { try { setErr(''); fn(); } catch (e) { setErr(e); } };
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="muted" style={{ fontSize: 13 }} dir="ltr">{tk.id}</span><h3 className="mb-0">{t(tk.title)}</h3></div><button className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button></div>
        <div className="kv-grid">
          <div><span>{t('About')}</span><b>{tk.ref?.name || '—'}</b></div>
          <div><span>{t('Team')}</span><b>{t(tk.team)}</b></div>
          <div><span>{t('Assigned to')}</span><b>{staffName(tk.assigneeId)}</b></div>
          <div><span>{t('Status')}</span><b>{t(tk.status)}</b></div>
          <div><span>{t('Created')}</span><b>{fmtDateTime(tk.createdAt, locale)}</b></div>
          <div><span>{t('Due')}</span><b className={isLate(tk) ? 'task-late' : ''}>{fmtDateTime(tk.dueAt, locale)}</b></div>
          {tk.note && <div className="full"><span>{t('Details')}</span><b>{tk.note}</b></div>}
        </div>
        {link && <Link to={link} className="btn btn-outline btn-sm mt-2" onClick={onClose}>{t('Open the item')} →</Link>}
        {err && <div className="alert error mt-2">{errText(t, err)}</div>}
        {tk.status !== 'Done' && (
          <div className="flex gap-1 wrap mt-2">
            {tk.status === 'Open' && <button className="btn btn-outline btn-sm" onClick={() => startTask(tk.id)}><Play size={14} /> {t('Start')}</button>}
            <button className="btn btn-primary btn-sm" onClick={() => completeTask(tk.id, note)}><CheckCircle2 size={14} /> {t('Mark done')}</button>
          </div>
        )}
        {tk.status !== 'Done' && canAssign && (
          <div className="card-soft mt-2"><b>{t('Reassign (manager)')}</b>
            <div className="flex gap-1 mt-1"><select className="input input-sm" value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{getStaff().filter((s) => s.status === 'Active' && !s.roles.includes('Owner')).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.roles.map((r) => t(r)).join(', ')}</option>)}</select><button className="btn btn-outline btn-sm" disabled={!to} onClick={() => act(() => reassignTask(tk.id, to, note))}><UserCog size={14} /> {t('Reassign')}</button></div>
          </div>
        )}
        {tk.status !== 'Done' && (
          <div className="card-soft mt-2"><b>{t('Transfer to another team')}</b>
            <div className="flex gap-1 mt-1"><select className="input input-sm" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">—</option>{allRoleNames().filter((r) => r !== 'Owner' && r !== tk.team).map((r) => <option key={r} value={r}>{t(r)}</option>)}</select><button className="btn btn-outline btn-sm" disabled={!team} onClick={() => act(() => transferTask(tk.id, team, note))}><ArrowRightLeft size={14} /> {t('Transfer')}</button></div>
            <span className="hint">{t('A reason is required: write it in the note below.')}</span>
          </div>
        )}
        <div className="field mt-2"><label>{t('Note')}</label><textarea className="input" rows="2" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn btn-outline btn-sm mt-1" disabled={!note.trim()} onClick={() => { addTaskNote(tk.id, note); setNote(''); }}>{t('Add note')}</button></div>
        <h4 className="mt-2">{t('History')}</h4>
        <ul className="tl-mini">{[...tk.history].reverse().map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · <b>{t(h.action, h.vars)}</b> · {h.by}{h.note ? ` · ${h.note}` : ''}</li>)}</ul>
      </aside>
    </div>
  );
}

/* ====================== Staff & roles ====================== */
const LEVELS = ['', 'view', 'own', 'tech', 'request', 'approve', 'full'];
export function AdminStaff() {
  const { t } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const edit = staffLevel('staff') === 'full';
  const [f, setF] = useState({ name: '', email: '', roles: ['Customer Service'] });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rolePerms, setRolePerms] = useState({});
  const matrix = roleMatrix();
  const roles = allRoleNames();
  const add = async (e) => { e.preventDefault(); setErr(''); try { const s = await addStaff(f); setMsg(s); setF({ name: '', email: '', roles: ['Customer Service'] }); } catch (er) { setErr(er); } };
  const toggleStatus = (s) => {
    const next = s.status === 'Active' ? 'Inactive' : 'Active';
    updateStaff(s.id, { status: next });
    if (next === 'Inactive') { const n = releaseTasksOf(s.id); setMsg({ released: n, name: s.name }); }
  };
  const toggleRole = (s, r) => { try { setErr(''); updateStaff(s.id, { roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] }); } catch (er) { setErr(er); } };
  return (
    <>
      <PageTitle title="Staff and roles" sub="Model staff, their roles and the permission matrix. One person can hold several roles. Two-step sign-in is mandatory." />
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {msg?.tempPassword && <div className="alert success mb-2"><KeyRound size={16} /> {t('Staff member added. Temporary password: {pw}', { pw: msg.tempPassword })}</div>}
      {msg?.released !== undefined && <div className="alert info mb-2"><Clock size={16} /> {t('{name} was deactivated. {n} open task(s) went back to the queue and were reassigned.', { name: msg.name, n: msg.released })}</div>}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Email')}</th>{roles.map((r) => <th key={r} className="center">{t(r)}</th>)}<th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {getStaff().map((s) => (
                <tr key={s.id} className={s.status !== 'Active' ? 'row-muted' : ''}>
                  <td><b>{s.name}</b></td><td dir="ltr">{s.email}</td>
                  {roles.map((r) => <td key={r} className="center"><input type="checkbox" disabled={!edit} checked={s.roles.includes(r)} onChange={() => toggleRole(s, r)} aria-label={t(r)} /></td>)}
                  <td><span className={`badge ${s.status === 'Active' ? 'green' : 'gray'}`}>{t(s.status)}</span></td>
                  <td>{edit && s.id !== 'admin-0001' && <button className="btn btn-outline btn-sm" onClick={() => toggleStatus(s)}>{t(s.status === 'Active' ? 'Deactivate' : 'Activate')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && (
          <form className="form-grid mt-2" onSubmit={add}>
            <div className="field"><label>{t('Name')}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field full"><label>{t('Roles')}</label><div className="chip-group">{roles.map((r) => <button type="button" key={r} className={`chip ${f.roles.includes(r) ? 'on' : ''}`} onClick={() => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] })}>{t(r)}</button>)}</div></div>
            <button className="btn btn-primary"><Plus size={15} /> {t('Add staff member')}</button>
          </form>
        )}
      </div>

      <div className="card mt-2">
        <h3>{t('Permission matrix')}</h3>
        <div className="table-wrap">
          <table className="perm-table">
            <thead><tr><th>{t('Action')}</th>{roles.map((r) => <th key={r}>{t(r)}</th>)}</tr></thead>
            <tbody>
              {STAFF_PERMS.map((p) => (
                <tr key={p.id}><td>{t(p.label)}</td>{roles.map((r) => { const lv = matrix[r]?.[p.id]; return <td key={r}>{lv ? <span className={`perm-lv ${lv}`}>{t(lv)}</span> : <span className="muted">–</span>}</td>; })}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('full = can do · approve = decides · request = raises it for approval · tech = technical part · own = own tasks only · view = read only')}</p>
      </div>

      {edit && (
        <div className="card mt-2">
          <h3>{t('Create a role')}</h3>
          <div className="field" style={{ maxWidth: 320 }}><label>{t('Role name')}</label><input className="input" value={roleName} onChange={(e) => setRoleName(e.target.value)} /></div>
          <div className="table-wrap mt-1"><table><tbody>
            {STAFF_PERMS.map((p) => <tr key={p.id}><td>{t(p.label)}</td><td><select className="input input-sm" value={rolePerms[p.id] || ''} onChange={(e) => setRolePerms({ ...rolePerms, [p.id]: e.target.value || undefined })}>{LEVELS.map((l) => <option key={l} value={l}>{l ? t(l) : '–'}</option>)}</select></td></tr>)}
          </tbody></table></div>
          <button className="btn btn-primary btn-sm mt-1" onClick={() => { try { saveCustomRole(roleName.trim(), Object.fromEntries(Object.entries(rolePerms).filter(([, v]) => v))); setRoleName(''); setRolePerms({}); setErr(''); } catch (er) { setErr(er); } }}><Plus size={14} /> {t('Save role')}</button>
          {roles.filter((r) => !DEFAULT_MATRIX[r]).map((r) => <span key={r} className="chip-mini" style={{ marginInlineStart: 8 }}>{r} <button className="icon-btn danger" onClick={() => { try { deleteCustomRole(r); } catch (er) { setErr(er); } }} aria-label={t('Remove')}><Trash2 size={12} /></button></span>)}
        </div>
      )}
    </>
  );
}

/* ====================== Owner dashboard (ADM-05) ====================== */
const sumBetween = (docs, from, to) => docs.filter((d) => d.date >= from && d.date < to).reduce((s, d) => s + (d.type === 'Credit note' ? -d.subtotal : d.subtotal), 0);
export function OwnerDashboard() {
  const { t } = useLang();
  const [tick, setTick] = useState(0);
  useDbVersion();
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(id); }, []);
  const data = useMemo(() => {
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const pSame = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours()).toISOString();
    const docs = allDocsWithCompany().filter((d) => d.status === 'Paid' || d.type === 'Credit note');
    const users = getUsers().filter((u) => u.role !== 'SuperAdmin');
    const active = users.filter((u) => stageOf(u) === 'Active');
    const mrr = active.reduce((s, u) => s + (Number(u.subscription?.months) === 12 ? Number(u.subscription?.priceAnnual || 0) / 12 : Number(u.subscription?.priceMonthly || 0)), 0);
    const newThis = users.filter((u) => u.createdAt >= mStart).length;
    const newPrev = users.filter((u) => u.createdAt >= pStart && u.createdAt < pSame).length;
    const leads = getLeads();
    const months = Array.from({ length: 6 }, (_, i) => { const a = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); const b = new Date(now.getFullYear(), now.getMonth() - 4 + i, 1); return { label: a.toLocaleDateString('en-GB', { month: 'short' }), v: sumBetween(docs, a.toISOString(), b.toISOString()) }; });
    return {
      revenue: sumBetween(docs, mStart, now.toISOString()), revenuePrev: sumBetween(docs, pStart, pSame), mrr, newThis, newPrev,
      active: active.length, byStage: STAGES.map((s) => [s, users.filter((u) => stageOf(u) === s).length]),
      leadsOpen: leads.filter((l) => !['Won', 'Lost'].includes(l.stage)).length, won: leads.filter((l) => l.stage === 'Won' && l.closedAt >= mStart).length,
      commissionsDue: getCommissions().filter((c) => c.status === 'Due').reduce((s, c) => s + c.amount, 0),
      lateTasks: getTasks().filter(isLate).length, months, at: new Date(),
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmp = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
  const Card = ({ icon: Icon, label, value, delta, note }) => (
    <div className="card kpi2">
      <span className="icon-box mb-0" style={{ width: 34, height: 34 }}><Icon size={17} /></span>
      <span className="kpi2-label">{t(label)}</span>
      <strong className="kpi2-value" dir="ltr">{value}</strong>
      {delta !== null && delta !== undefined ? <span className={`cmp ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {t('{n}% vs same time last month', { n: Math.abs(delta) })}</span> : note ? <span className="kpi2-note">{t(note)}</span> : null}
    </div>
  );
  const max = Math.max(1, ...data.months.map((m) => m.v));
  return (
    <>
      <PageTitle title="Owner dashboard" sub="Live view, read only. Updates within a minute of every event."><span className="muted" style={{ fontSize: 13 }}>{t('Updated {time}', { time: timeAgo(data.at, t) })}</span></PageTitle>
      <div className="owner-grid">
        <Card icon={Receipt} label="Revenue this month (excl. VAT)" value={formatMoney(data.revenue.toFixed(0))} delta={cmp(data.revenue, data.revenuePrev)} />
        <Card icon={TrendingUp} label="Monthly recurring revenue" value={formatMoney(data.mrr.toFixed(0))} note="Active subscriptions" />
        <Card icon={Building2} label="New customers this month" value={data.newThis} delta={cmp(data.newThis, data.newPrev)} />
        <Card icon={Users} label="Active customers" value={data.active} />
        <Card icon={Target} label="Open leads" value={data.leadsOpen} note={t("{n} won this month", { n: data.won })} />
        <Card icon={Handshake} label="Commissions due" value={formatMoney(data.commissionsDue.toFixed(0))} />
        <Card icon={AlertTriangle} label="Late tasks" value={data.lateTasks} />
      </div>
      <div className="dash-grid mt-2">
        <div className="card">
          <h3>{t('Revenue, last 6 months')}</h3>
          <div className="mini-bars" style={{ height: 140 }}>{data.months.map((m) => <i key={m.label} title={`${m.label}: ${formatMoney(m.v.toFixed(0))}`} style={{ height: `${(m.v / max) * 100}%` }} />)}</div>
          <div className="flex between muted" style={{ fontSize: 12 }}>{data.months.map((m) => <span key={m.label}>{m.label}</span>)}</div>
        </div>
        <div className="card">
          <h3>{t('Customers by stage')}</h3>
          {data.byStage.map(([s, n]) => <div className="queue-row" key={s}><span>{t(s)}</span><b dir="ltr">{n}</b></div>)}
        </div>
      </div>
    </>
  );
}

/* ====================== Audit log (ADM-06) ====================== */
export function AdminAudit() {
  const { t, locale } = useLang();
  useDbVersion();
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const all = getAudit();
  const areas = [...new Set(all.map((a) => a.area))];
  const list = all.filter((a) => (!area || a.area === area) && (!q || [a.actor, a.action, a.entity, a.before, a.after].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))));
  return (
    <>
      <PageTitle title="Audit log" sub="Every operation: who, when, the value before and after. Entries cannot be changed or deleted.">
        <div className="flex gap-1"><select className="input input-sm" value={area} onChange={(e) => setArea(e.target.value)}><option value="">{t('All areas')}</option>{areas.map((a) => <option key={a} value={a}>{t(a)}</option>)}</select>
          <div className="input-wrap" style={{ minWidth: 240 }}><Search size={16} /><input className="input" placeholder={t('Search…')} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      </PageTitle>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Time')}</th><th>{t('Who')}</th><th>{t('Area')}</th><th>{t('Action')}</th><th>{t('Item')}</th><th>{t('Before')}</th><th>{t('After')}</th></tr></thead>
            <tbody>
              {list.slice(0, 300).map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at, locale)}</td>
                  <td>{a.actor}</td><td>{t(a.area)}</td><td><b>{t(a.action)}</b></td><td dir="auto">{a.entity}</td>
                  <td><code dir="ltr" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{a.before ?? '—'}</code></td>
                  <td><code dir="ltr" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{a.after ?? '—'}</code></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan="7" className="center muted" style={{ padding: 28 }}>{t('No entries yet.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export const TASK_TYPE_LIST = TASK_TYPES;
