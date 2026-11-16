// CRM for Sales (CRM-01..CRM-06): pipeline, lead file, Excel import with invitations, marketing campaigns.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, Plus, Send, Upload, CheckCircle2, Mail, Phone, CalendarPlus, UserCog, Megaphone, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { getLeads, getLead, createLead, setLeadStage, addLeadNote, markContacted, addFollowUp, toggleFollowUp, reassignLead, sendInvite, importClients, getCampaigns, sendCampaign, audienceFor, LEAD_STAGES, LEAD_SOURCES } from '../../services/crm';
import { getPlatform } from '../../services/platform';
import { getStaff, staffName } from '../../services/staff';
import { getTasks } from '../../services/tasks';
import { getPartner } from '../../services/partners';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime, timeAgo } from '../../utils/format';

const ST_BADGE = { New: 'orange', Qualified: 'blue', Proposal: 'purple', Won: 'green', Lost: 'gray' };

export function AdminCrm() {
  const { t } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'pipeline';
  const open = params.get('l');
  const edit = staffLevel('leads') === 'full';
  return (
    <>
      <PageTitle title="Leads" sub="Every lead keeps its source. New leads go to Sales in turn and must be contacted within one working day." />
      <div className="subtabs mb-2">{[['pipeline', 'Pipeline'], ...(edit ? [['new', 'Add lead'], ['import', 'Import clients'], ['campaigns', 'Marketing']] : [])].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>{t(l)}</button>)}</div>
      {tab === 'pipeline' && <Pipeline onOpen={(id) => setParams({ tab, l: id })} />}
      {tab === 'new' && <NewLead onDone={(id) => setParams({ tab: 'pipeline', l: id })} />}
      {tab === 'import' && <ImportClients />}
      {tab === 'campaigns' && <Campaigns />}
      {open && getLead(open) && <LeadDrawer id={open} edit={edit} onClose={() => setParams({ tab })} />}
    </>
  );
}

function Pipeline({ onOpen }) {
  const { t } = useLang();
  const [src, setSrc] = useState('');
  const [mine, setMine] = useState(false);
  const { user } = useAuth();
  const leads = getLeads().filter((l) => (!src || l.source === src) && (!mine || l.assigneeId === user.id));
  const late = new Set(getTasks().filter((x) => x.status !== 'Done' && x.ref?.kind === 'lead' && new Date(x.dueAt) < new Date()).map((x) => x.ref.id));
  return (
    <>
      <div className="flex gap-1 wrap mb-2">
        <select className="input input-sm" style={{ maxWidth: 220 }} value={src} onChange={(e) => setSrc(e.target.value)}><option value="">{t('All sources')}</option>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
        <label className="checkbox"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {t('Only mine')}</label>
      </div>
      <div className="kanban">
        {LEAD_STAGES.map((s) => {
          const col = leads.filter((l) => l.stage === s);
          return (
            <div className="kan-col" key={s}>
              <h4><span>{t(s)}</span><span className="muted">{col.length}</span></h4>
              {col.map((l) => (
                <button className="kan-card" key={l.id} onClick={() => onOpen(l.id)}>
                  <b>{l.company || l.name}</b>
                  <small>{l.name} · {t(l.source)}</small>
                  <small>{staffName(l.assigneeId)} · {timeAgo(l.createdAt, t)}</small>
                  {late.has(l.id) && <span className="badge red"><AlertTriangle size={11} /> {t('First contact late')}</span>}
                  {l.invite && <span className="badge blue">{t('Invitation: {s}', { s: t(l.invite.status) })}</span>}
                  {l.value > 0 && <small dir="ltr">{formatMoney(l.value)}</small>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function LeadDrawer({ id, edit, onClose }) {
  const { t, locale } = useLang();
  const l = getLead(id);
  const p = getPlatform();
  const [note, setNote] = useState('');
  const [fu, setFu] = useState({ dueAt: '', text: '' });
  const [loss, setLoss] = useState('');
  const [err, setErr] = useState('');
  const act = (fn) => { try { setErr(''); fn(); } catch (e) { setErr(e); } };
  const partner = l.partnerId ? getPartner(l.partnerId) : null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="muted" style={{ fontSize: 13 }}>{l.id} · {t(l.source)}</span><h3 className="mb-0">{l.company || l.name}</h3></div><div className="flex items-center gap-1"><span className={`badge ${ST_BADGE[l.stage]}`}>{t(l.stage)}</span><button className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button></div></div>
        {err && <div className="alert error mb-2">{errText(t, err)}</div>}
        <div className="kv-grid">
          <div><span>{t('Contact')}</span><b>{l.name}</b></div>
          <div><span>{t('Assigned to')}</span><b>{staffName(l.assigneeId)}</b></div>
          <div><span><Mail size={12} /> {t('Email')}</span><b dir="ltr">{l.email || '—'}</b></div>
          <div><span><Phone size={12} /> {t('Mobile')}</span><b dir="ltr">{l.phone || '—'}</b></div>
          <div><span>{t('Created')}</span><b>{fmtDateTime(l.createdAt, locale)}</b></div>
          <div><span>{t('First contact')}</span><b>{l.contactedAt ? fmtDateTime(l.contactedAt, locale) : t('Not yet')}</b></div>
          {partner && <div><span>{t('Partner')}</span><b>{partner.name}</b></div>}
          {l.sentBy && <div><span>{t('Shared by')}</span><b>{l.sentBy}</b></div>}
          {l.tool && <div className="full"><span>{t('Obligation check')}</span><b>{t('Revenue {r} · B2B {b} · {m} docs/month · {p}', { r: t(l.tool.revenue || '—'), b: t(l.tool.b2b === 'yes' ? 'Yes' : 'No'), m: l.tool.monthly ?? '—', p: t(l.tool.package || '—') })}</b></div>}
          {l.lossReason && <div><span>{t('Loss reason')}</span><b>{t(l.lossReason)}</b></div>}
        </div>
        {edit && (
          <>
            <div className="flex gap-1 wrap mt-2">
              {!l.contactedAt && <button className="btn btn-primary btn-sm" onClick={() => act(() => markContacted(l.id))}><CheckCircle2 size={14} /> {t('First contact made')}</button>}
              {['New', 'Qualified', 'Proposal'].map((s) => s !== l.stage && LEAD_STAGES.indexOf(s) > LEAD_STAGES.indexOf(l.stage) && <button key={s} className="btn btn-outline btn-sm" onClick={() => act(() => setLeadStage(l.id, s))}>{t('Move to {s}', { s: t(s) })}</button>)}
              {!['Won', 'Lost'].includes(l.stage) && <button className="btn btn-success btn-sm" onClick={() => act(() => { setLeadStage(l.id, 'Won'); if (l.email && l.source !== 'Enterprise') sendInvite(l.id); })}>{t('Won → send registration link')}</button>}
            </div>
            {!['Won', 'Lost'].includes(l.stage) && <div className="flex gap-1 mt-1"><select className="input input-sm" value={loss} onChange={(e) => setLoss(e.target.value)}><option value="">{t('Loss reason')}</option>{p.lossReasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select><button className="btn btn-outline btn-sm" onClick={() => act(() => setLeadStage(l.id, 'Lost', { lossReason: loss }))}>{t('Mark lost')}</button></div>}
            {l.email && <div className="card-soft mt-2"><b>{t('Registration invitation')}</b><p className="muted mb-1" style={{ fontSize: 13 }}>{t('A link with the lead’s details filled in. The customer only reviews them.')}</p>{l.invite ? <p className="mb-1">{t('Status: {s}', { s: t(l.invite.status) })} · <span dir="ltr" style={{ fontSize: 12, wordBreak: 'break-all' }}>{l.invite.link}</span></p> : null}<button className="btn btn-outline btn-sm" onClick={() => act(() => sendInvite(l.id))}><Send size={14} /> {t(l.invite ? 'Send again' : 'Send invitation')}</button></div>}
            <div className="flex gap-1 mt-2"><select className="input input-sm" defaultValue="" onChange={(e) => e.target.value && act(() => reassignLead(l.id, e.target.value))}><option value="">{t('Reassign to…')}</option>{getStaff().filter((s) => s.status === 'Active' && s.roles.includes('Sales')).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><UserCog size={18} color="#64748b" /></div>
          </>
        )}
        <h4 className="mt-2">{t('Follow-ups')}</h4>
        <ul className="tl-mini">{l.followUps.map((f) => <li key={f.id}><label className="checkbox"><input type="checkbox" checked={f.done} disabled={!edit} onChange={() => toggleFollowUp(l.id, f.id)} /> {fmtDate(f.dueAt, locale)} · {f.text}</label></li>)}{!l.followUps.length && <li className="muted">{t('None.')}</li>}</ul>
        {edit && <div className="flex gap-1"><input className="input input-sm" type="date" dir="ltr" style={{ maxWidth: 160 }} value={fu.dueAt} onChange={(e) => setFu({ ...fu, dueAt: e.target.value })} /><input className="input input-sm" placeholder={t('What to do')} value={fu.text} onChange={(e) => setFu({ ...fu, text: e.target.value })} /><button className="btn btn-outline btn-sm" onClick={() => act(() => { addFollowUp(l.id, fu); setFu({ dueAt: '', text: '' }); })}><CalendarPlus size={14} /></button></div>}
        <h4 className="mt-2">{t('Notes')}</h4>
        <ul className="tl-mini">{l.notes.map((n, i) => <li key={i}><small className="muted">{fmtDateTime(n.at, locale)} · {n.by}</small><br />{n.text}</li>)}</ul>
        {edit && <div className="flex gap-1"><input className="input input-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Add a note…')} /><button className="btn btn-outline btn-sm" onClick={() => { addLeadNote(l.id, note); setNote(''); }}>{t('Add')}</button></div>}
        <h4 className="mt-2">{t('History')}</h4>
        <ul className="tl-mini">{[...l.history].reverse().map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · {t(h.action, h.vars)} · {h.by}</li>)}</ul>
      </aside>
    </div>
  );
}

function NewLead({ onDone }) {
  const { t } = useLang();
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', source: 'Website form', note: '', value: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="form-grid">
        <div className="field"><label>{t('Contact name')}</label><input className="input" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label>{t('Company')}</label><input className="input" value={f.company} onChange={set('company')} /></div>
        <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label>{t('Mobile')}</label><input className="input" dir="ltr" value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label>{t('Source')}</label><select className="input" value={f.source} onChange={set('source')}>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></div>
        <div className="field"><label>{t('Expected value (AED)')}</label><input className="input" type="number" dir="ltr" value={f.value} onChange={set('value')} /></div>
        <div className="field full"><label>{t('Note')}</label><textarea className="input" rows="2" value={f.note} onChange={set('note')} /></div>
      </div>
      <button className="btn btn-primary mt-2" disabled={!f.name && !f.company} onClick={() => onDone(createLead(f).id)}><Plus size={15} /> {t('Create lead')}</button>
    </div>
  );
}

function ImportClients() {
  const { t } = useLang();
  const [rows, setRows] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const read = async (file) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    setRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })); setRes(null);
  };
  const template = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Company', 'Name', 'Email', 'Phone', 'TRN', 'Trade licence'], ['Example Trading LLC', 'Ali Hassan', 'ali@example.ae', '+971501234567', '100123456700003', 'CN-1234567']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Clients'); XLSX.writeFile(wb, 'model-clients-template.xlsx');
  };
  const go = async () => { setBusy(true); setRes(await importClients(rows)); setBusy(false); };
  return (
    <div className="card" style={{ maxWidth: 820 }}>
      <h3>{t('Import Model’s existing clients')}</h3>
      <p className="muted">{t('Each client becomes a lead with the source “Existing Model client” and receives an invitation with their details filled in. You can follow Sent → Opened → Registered.')}</p>
      <div className="flex gap-1 wrap"><button className="btn btn-outline btn-sm" onClick={template}>{t('Download template')}</button><label className="btn btn-primary btn-sm"><Upload size={14} /> {t('Choose Excel file')}<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} /></label></div>
      {rows && !res && <><p className="mt-2">{t('{n} rows found.', { n: rows.length })}</p><div className="table-wrap"><table><thead><tr>{Object.keys(rows[0] || {}).map((k) => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>)}</tbody></table></div><button className="btn btn-primary mt-2" disabled={busy} onClick={go}>{busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {t('Import and send invitations')}</button></>}
      {res && <div className="alert success mt-2"><CheckCircle2 size={16} /> <span>{t('{a} leads added, {i} invitations sent, {s} skipped.', { a: res.added, i: res.invited, s: res.skipped.length })} {res.skipped.map((s) => `${t('Row')} ${s.row}: ${t(s.reason)}`).join(' · ')}</span></div>}
    </div>
  );
}

function Campaigns() {
  const { t, locale } = useLang();
  const [f, setF] = useState({ name: '', subjectEn: '', bodyEn: '', bodyAr: '', stages: [], sources: [] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const aud = audienceFor(f);
  const tog = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const send = async () => { setBusy(true); setErr(''); try { await sendCampaign(f); setF({ name: '', subjectEn: '', bodyEn: '', bodyAr: '', stages: [], sources: [] }); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <>
      <div className="card">
        <h3><Megaphone size={18} /> {t('New marketing message')}</h3>
        {err && <div className="alert error mb-2">{errText(t, err)}</div>}
        <div className="form-grid">
          <div className="field"><label>{t('Name')}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>{t('Subject')}</label><input className="input" value={f.subjectEn} onChange={(e) => setF({ ...f, subjectEn: e.target.value })} /></div>
          <div className="field full"><label>{t('Text (English)')}</label><textarea className="input" rows="3" value={f.bodyEn} onChange={(e) => setF({ ...f, bodyEn: e.target.value })} /></div>
          <div className="field full"><label>{t('Text (Arabic)')}</label><textarea className="input" dir="rtl" rows="3" value={f.bodyAr} onChange={(e) => setF({ ...f, bodyAr: e.target.value })} /></div>
          <div className="field full"><label>{t('Stages')}</label><div className="chip-group">{LEAD_STAGES.map((s) => <button key={s} type="button" className={`chip ${f.stages.includes(s) ? 'on' : ''}`} onClick={() => tog('stages', s)}>{t(s)}</button>)}</div></div>
          <div className="field full"><label>{t('Sources')}</label><div className="chip-group">{LEAD_SOURCES.map((s) => <button key={s} type="button" className={`chip ${f.sources.includes(s) ? 'on' : ''}`} onClick={() => tog('sources', s)}>{t(s)}</button>)}</div></div>
        </div>
        <p className="mt-2">{t('{n} recipients · {u} unsubscribed and excluded automatically. Every message has an unsubscribe link.', { n: aud.filter((l) => !l.unsubscribed).length, u: aud.filter((l) => l.unsubscribed).length })}</p>
        <button className="btn btn-primary" disabled={busy} onClick={send}>{busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {t('Send')}</button>
      </div>
      <div className="card mt-2">
        <h3>{t('Sent messages')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Message')}</th><th>{t('Date')}</th><th>{t('Sent')}</th><th>{t('Excluded')}</th><th>{t('By')}</th></tr></thead>
          <tbody>{getCampaigns().map((c) => <tr key={c.id}><td><b>{c.name}</b></td><td>{fmtDateTime(c.at, locale)}</td><td>{c.sent}</td><td>{c.excluded}</td><td>{c.by}</td></tr>)}{!getCampaigns().length && <tr><td colSpan="5" className="muted center">{t('None yet.')}</td></tr>}</tbody></table></div>
      </div>
    </>
  );
}
