// Customer Service: new customers, documents, linking and activation, re-verify / unlink / move,
// and following active customers (REG-06..REG-10, ADM-02).
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, CheckCircle2, AlertTriangle, Loader2, FileText, Link2, Power, RefreshCcw, BadgePercent, Handshake, Receipt, Search, Play, Clock, ShieldCheck, ArrowRightLeft, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { StageTracker, TaxDoc, Modal, E_STATUS_BADGE } from '../../components/Brd';
import { getUsers, getUserById } from '../../services/api';
import { STAGES, STAGE_BADGE, stageOf, requiredDocs, acceptDocument, requestDocument, completeReview, retrievePeppolId, activate, submitForApproval, executeService, suspend, resume, setConsultingStatus } from '../../services/lifecycle';
import { docsOf, issueCreditNote, sendEInvoice } from '../../services/modelDocs';
import { runRenewal, graceTick, setSpecialDiscount } from '../../services/billing';
import { usageSummary } from '../../services/usage';
import { getPartners, getPartner, attributeCustomer } from '../../services/partners';
import { getTasks } from '../../services/tasks';
import { staffName } from '../../services/staff';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime } from '../../utils/format';

export function AdminOnboarding() {
  const { t, locale } = useLang();
  useDbVersion();
  const [params, setParams] = useSearchParams();
  const [stage, setStage] = useState(params.get('stage') || '');
  const [q, setQ] = useState('');
  const openId = params.get('c');
  const customers = getUsers().filter((u) => u.role !== 'SuperAdmin');
  const counts = Object.fromEntries(STAGES.map((s) => [s, customers.filter((u) => stageOf(u) === s).length]));
  const tasks = getTasks().filter((x) => x.status !== 'Done');
  const list = customers.filter((u) => (!stage || stageOf(u) === stage) && (!q || [u.company?.name, u.fullName, u.email, u.company?.trn].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => STAGES.indexOf(stageOf(a)) - STAGES.indexOf(stageOf(b)));
  return (
    <>
      <PageTitle title="Customers and onboarding" sub="Every customer by stage. Open one to review documents, link, activate or handle a request.">
        <div className="input-wrap" style={{ minWidth: 260 }}><Search size={16} /><input className="input" placeholder={t('Search company, email, TRN…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PageTitle>
      <div className="subtabs mb-2">
        <button className={!stage ? 'on' : ''} onClick={() => setStage('')}>{t('All')} <span className="subtab-count">{customers.length}</span></button>
        {STAGES.map((s) => <button key={s} className={stage === s ? 'on' : ''} onClick={() => setStage(s)}>{t(s)} <span className="subtab-count">{counts[s]}</span></button>)}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Company')}</th><th>{t('Stage')}</th><th>{t('Package')}</th><th>{t('Documents')}</th><th>{t('Linking')}</th><th>{t('Open tasks')}</th><th>{t('Since')}</th></tr></thead>
            <tbody>
              {list.map((u) => {
                const req = requiredDocs(u).filter((d) => d.required);
                const ok = req.filter((d) => (u.documents || []).some((x) => x.id === d.id && x.status === 'Accepted')).length;
                const myTasks = tasks.filter((x) => String(x.ref?.id || '').startsWith(u.id));
                const last = (u.stageHistory || []).slice(-1)[0];
                return (
                  <tr key={u.id} className="row-click" onClick={() => setParams({ c: u.id })}>
                    <td><b>{u.company?.name || u.fullName}</b><small className="muted" style={{ display: 'block' }}>{u.email}</small></td>
                    <td><span className={`badge ${STAGE_BADGE[stageOf(u)]}`}>{t(stageOf(u))}</span></td>
                    <td>{u.subscription ? t(u.subscription.packageName) : '—'}</td>
                    <td dir="ltr">{ok} / {req.length}</td>
                    <td><span className={`badge ${u.linking?.status === 'Linked' ? 'green' : u.linking?.status === 'Failed' ? 'red' : 'gray'}`}>{t(u.linking?.status || 'Not started')}</span></td>
                    <td>{myTasks.length ? <span className="badge orange">{myTasks.length}</span> : '—'}</td>
                    <td className="muted">{last ? fmtDate(last.at, locale) : fmtDate(u.createdAt, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {openId && getUserById(openId) && <CustomerFile userId={openId} onClose={() => setParams({})} />}
    </>
  );
}

export function CustomerFile({ userId, onClose }) {
  const { t, locale } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const u = getUserById(userId);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState({});
  const [msg, setMsg] = useState('');
  const [doc, setDoc] = useState(null);
  const [disc, setDisc] = useState({ type: 'percent', value: '', cycles: 1, note: '' });
  const [cn, setCn] = useState({ invoiceId: '', amount: '', reason: '' });
  const [transfer, setTransfer] = useState('');
  const canDocs = ['full'].includes(staffLevel('documents'));
  const canLink = staffLevel('linking') === 'full';
  const discLv = staffLevel('disconnect');
  const isManager = staffLevel('packages') === 'full';
  const canRefund = ['full', 'approve'].includes(staffLevel('refunds'));
  if (!u) return null;
  const stage = stageOf(u);
  const run = async (key, fn, okMsg) => { setBusy(key); setErr(''); setMsg(''); try { const r = await fn(); if (okMsg) setMsg(typeof okMsg === 'function' ? okMsg(r) : okMsg); } catch (e) { setErr(e); } finally { setBusy(''); } };
  const usage = usageSummary(u.subscription);
  const docs = docsOf(u.id);
  const partner = u.partner ? getPartner(u.partner.partnerId) : null;
  const TABS = [['overview', 'Overview'], ['documents', 'Documents'], ['linking', 'Linking'], ['requests', 'Requests'], ['billing', 'Billing'], ['partner', 'Partner'], ['history', 'History']];
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" style={{ width: 'min(820px, 100vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><span className="muted" style={{ fontSize: 13 }}>{u.fullName} · {u.email}</span><h3 className="mb-0">{u.company?.name || u.fullName}</h3></div>
          <div className="flex items-center gap-1"><span className={`badge ${STAGE_BADGE[stage]}`}>{t(stage)}</span><button className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button></div>
        </div>
        <StageTracker stage={stage} />
        <div className="subtabs mt-2 mb-2">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
        {err && <div className="alert error mb-2"><AlertTriangle size={16} /> {errText(t, err)}</div>}
        {msg && <div className="alert success mb-2"><CheckCircle2 size={16} /> {typeof msg === 'string' ? t(msg) : t(msg.key, msg.vars)}</div>}

        {tab === 'overview' && (
          <>
            <div className="kv-grid">
              <div><span>{t('Legal name')}</span><b>{u.company?.legalName || '—'}</b></div>
              <div><span>{t('Trade licence')}</span><b dir="ltr">{u.company?.tradeLicense || '—'}</b></div>
              <div><span>{t('Issuing authority')}</span><b>{u.company?.licenceIssuer || '—'}</b></div>
              <div><span>{t('Licence expiry')}</span><b>{fmtDate(u.company?.licenceExpiry, locale)}</b></div>
              <div><span>{t('TIN')}</span><b dir="ltr">{u.company?.tin || '—'}</b></div>
              <div><span>{t('TRN')}</span><b dir="ltr">{u.company?.trn || t('Not registered')}</b></div>
              <div><span>{t('Emirate')}</span><b>{t(u.company?.emirate || '—')}</b></div>
              <div><span>{t('Activity')}</span><b>{t(u.company?.activity || '—')}</b></div>
              <div><span>{t('EmaraTax email')}</span><b dir="ltr">{u.company?.emaraTaxEmail || '—'}</b></div>
              <div><span>{t('Sending method')}</span><b>{t(u.company?.sendingMethod || '—')}</b></div>
              <div><span>{t('Package')}</span><b>{u.subscription ? `${t(u.subscription.packageName)} · ${t(u.subscription.billing || 'Monthly')}` : '—'}</b></div>
              <div><span>{t('Subscription status')}</span><b>{t(u.subscription?.status || '—')}</b></div>
            </div>
            {usage && <div className="card-soft mt-2"><b>{t('Usage this month')}</b><p className="mb-0">{t('Free {a}/{b} · month {c}/{d} · carried {e}/{f} · extra {g}', { a: usage.free.used, b: usage.free.total, c: usage.month.used, d: usage.month.total, e: usage.carry.used, f: usage.carry.total, g: usage.overage.count })}</p></div>}
            <h4 className="mt-2">{t('Open tasks')}</h4>
            <ul className="tl-mini">{getTasks().filter((x) => x.status !== 'Done' && String(x.ref?.id || '').startsWith(u.id)).map((x) => <li key={x.id}><b>{t(x.title)}</b> · {staffName(x.assigneeId)} · {t('due {date}', { date: fmtDateTime(x.dueAt, locale) })}</li>)}</ul>
            {stage === 'Active' && isManager && <button className="btn btn-outline btn-sm mt-1" onClick={() => run('susp', () => suspend(u.id, 'Suspended by the manager'), 'Account suspended.')}><Power size={14} /> {t('Suspend')}</button>}
            {stage === 'Suspended' && isManager && <button className="btn btn-primary btn-sm mt-1" onClick={() => run('res', () => resume(u.id, 'Resumed by the manager'), 'Account resumed.')}><Play size={14} /> {t('Resume')}</button>}
          </>
        )}

        {tab === 'documents' && (
          <>
            {requiredDocs(u).map((d) => {
              const x = (u.documents || []).find((y) => y.id === d.id);
              return (
                <div className="doc-row" key={d.id}>
                  <FileText size={18} color="#64748b" />
                  <div className="grow"><b>{t(d.label)}</b>{!d.required && <span className="muted"> · {t('optional')}</span>}<small>{x ? `${x.fileName} · ${fmtDateTime(x.uploadedAt, locale)}` : t('Not uploaded yet')}</small>{x?.note && <small className="text-danger">{x.note}</small>}</div>
                  <span className={`badge ${x?.status === 'Accepted' ? 'green' : x?.status === 'Missing' ? 'red' : x ? 'blue' : 'gray'}`}>{t(x?.status || 'Not uploaded')}</span>
                  {canDocs && x && x.status !== 'Accepted' && <button className="btn btn-outline btn-sm" onClick={() => acceptDocument(u.id, d.id)}><CheckCircle2 size={14} /> {t('Accept')}</button>}
                  {canDocs && <div className="flex gap-1" style={{ width: '100%' }}><input className="input input-sm" placeholder={t('What is missing?')} value={note[d.id] || ''} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} /><button className="btn btn-outline btn-sm" onClick={() => run(`rq-${d.id}`, () => requestDocument(u.id, d.id, note[d.id]), 'The customer was asked for the document.')}>{t('Ask the customer')}</button></div>}
                </div>
              );
            })}
            <p className="muted" style={{ fontSize: 13 }}>{t('There is no rejection: anything missing is completed with the customer.')}</p>
            {canDocs && ['Under review', 'Awaiting documents'].includes(stage) && <button className="btn btn-primary" onClick={() => run('rev', () => completeReview(u.id), 'Review complete. The customer moved to linking.')}><ShieldCheck size={15} /> {t('Review complete → linking')}</button>}
          </>
        )}

        {tab === 'linking' && (
          <>
            <div className="kv-grid">
              <div><span>{t('Status')}</span><b>{t(u.linking?.status || 'Not started')}</b></div>
              <div><span>{t('Peppol ID')}</span><b dir="ltr">{u.linking?.peppolId || '—'}</b></div>
              <div><span>{t('Authorised in EmaraTax')}</span><b>{u.linking?.authorisedAt ? fmtDateTime(u.linking.authorisedAt, locale) : '—'}</b></div>
              <div><span>{t('Attempts')}</span><b>{u.linking?.attempts || 0}</b></div>
              <div><span>{t('Registered in SMP')}</span><b>{t(u.linking?.smpRegistered ? 'Yes' : 'No')}</b></div>
              <div><span>{t('Last error')}</span><b>{u.linking?.lastError ? t(u.linking.lastError) : '—'}</b></div>
            </div>
            {canLink && (
              <div className="flex gap-1 wrap mt-2">
                <button className="btn btn-outline btn-sm" disabled={busy === 'pid'} onClick={() => run('pid', () => retrievePeppolId(u.id), (r) => (r.ok ? { key: 'Peppol ID {id} retrieved and verified.', vars: { id: r.peppolId } } : { key: 'Retrieval failed: {err}', vars: { err: r.error } }))}>{busy === 'pid' ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />} {t('Retrieve Peppol ID')}</button>
                <button className="btn btn-outline btn-sm" disabled={busy === 'pidf'} onClick={() => run('pidf', () => retrievePeppolId(u.id, { forceFail: true }), 'Simulated failure: a task was created for Customer Service.')}>{t('Simulate a failure')}</button>
                {stage === 'Awaiting linking' && <button className="btn btn-primary btn-sm" disabled={u.linking?.status !== 'Linked'} onClick={() => run('act', () => activate(u.id), 'Activated. The subscription year starts today.')}><Power size={14} /> {t('Activate')}</button>}
              </div>
            )}
            {stage === 'Awaiting linking' && u.linking?.status !== 'Linked' && <p className="muted mt-1" style={{ fontSize: 13 }}>{t('Activation needs a verified Peppol ID.')}</p>}
          </>
        )}

        {tab === 'requests' && (
          <>
            {(u.serviceRequests || []).map((r) => (
              <div className="card-soft mb-1" key={r.id}>
                <div className="flex between items-center"><b>{t(r.kind)}{r.newProvider ? ` → ${r.newProvider}` : ''}</b><span className={`badge ${r.status === 'Done' ? 'green' : r.status === 'Failed' ? 'red' : 'orange'}`}>{t(r.status)}</span></div>
                <ul className="tl-mini">{r.steps.map((s, i) => <li key={i}><small className="muted">{fmtDateTime(s.at, locale)}</small> · {t(s.action, { provider: r.newProvider })} · {s.by}</li>)}</ul>
                {r.status !== 'Done' && (
                  <div className="flex gap-1 wrap">
                    {r.kind === 'Re-verify' && discLv && ['full', 'approve'].includes(discLv) && <button className="btn btn-primary btn-sm" onClick={() => run(r.id, () => executeService(u.id, r.id), 'Done.')}><RefreshCcw size={14} /> {t('Re-verify now')}</button>}
                    {r.kind !== 'Re-verify' && discLv === 'full' && r.status === 'Requested' && <button className="btn btn-outline btn-sm" onClick={() => run(r.id, () => submitForApproval(u.id, r.id), 'Sent to the manager for approval.')}>{t('Send for manager approval')}</button>}
                    {r.kind !== 'Re-verify' && discLv === 'approve' && <button className="btn btn-danger btn-sm" disabled={busy === r.id} onClick={() => run(r.id, () => executeService(u.id, r.id), 'Done. The customer was removed from SMP.')}>{busy === r.id ? <Loader2 size={14} className="spin" /> : <ArrowRightLeft size={14} />} {t('Approve and execute now')}</button>}
                  </div>
                )}
              </div>
            ))}
            {!(u.serviceRequests || []).length && <p className="muted">{t('No requests.')}</p>}
            <p className="muted" style={{ fontSize: 13 }}>{t('Unlinking and moving are never held back for unpaid amounts. The archive stays available for 90 days, then on request.')}</p>
            {(u.consulting || []).length > 0 && <>
              <h4 className="mt-2">{t('Consulting requests')}</h4>
              {(u.consulting || []).map((r) => <div key={r.id} className="flex between items-center doc-row"><span><b>{t(r.name)}</b> · {r.hours} h · {r.final ? formatMoney(r.final) : t('Included')}</span><span className="flex gap-1"><span className="badge blue">{t(r.status)}</span>{r.status === 'Requested' && <button className="btn btn-outline btn-sm" onClick={() => setConsultingStatus(u.id, r.id, 'Scheduled')}>{t('Scheduled')}</button>}{r.status === 'Scheduled' && <button className="btn btn-outline btn-sm" onClick={() => setConsultingStatus(u.id, r.id, 'Completed')}>{t('Completed')}</button>}</span></div>)}
            </>}
          </>
        )}

        {tab === 'billing' && (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Number')}</th><th>{t('Date')}</th><th>{t('Total')}</th><th>{t('Status')}</th><th>{t('E-invoice')}</th><th /></tr></thead>
                <tbody>{docs.map((d) => <tr key={d.id}><td dir="ltr"><b>{d.id}</b></td><td>{fmtDate(d.date, locale)}</td><td dir="ltr">{d.type === 'Credit note' ? '−' : ''}{formatMoney(d.total)}</td><td><span className={`badge ${['Paid', 'Issued'].includes(d.status) ? 'green' : 'orange'}`}>{t(d.status)}</span></td><td><span className={`badge ${E_STATUS_BADGE[d.einvoice?.status] || 'gray'}`}>{t(d.einvoice?.status || '—')}</span>{d.einvoice?.status === 'Rejected' && <button className="link-btn" onClick={() => sendEInvoice(d.id)}>{t('Resend')}</button>}</td><td><button className="icon-btn" onClick={() => setDoc(d)} aria-label={t('View')}><Eye size={15} /></button></td></tr>)}</tbody>
              </table>
            </div>
            {canRefund && (
              <div className="card-soft mt-2"><b>{t('Credit note')}</b><p className="muted mb-1" style={{ fontSize: 13 }}>{t('No invoice can be changed or deleted. Corrections are made with a credit note.')}</p>
                <div className="form-grid">
                  <div className="field"><label>{t('Invoice')}</label><select className="input input-sm" value={cn.invoiceId} onChange={(e) => setCn({ ...cn, invoiceId: e.target.value })}><option value="">—</option>{docs.filter((d) => d.type === 'Invoice').map((d) => <option key={d.id} value={d.id}>{d.id} · {formatMoney(d.subtotal - (d.creditedAmount || 0))}</option>)}</select></div>
                  <div className="field"><label>{t('Amount excl. VAT')}</label><input className="input input-sm" type="number" dir="ltr" value={cn.amount} onChange={(e) => setCn({ ...cn, amount: e.target.value })} /></div>
                  <div className="field full"><label>{t('Reason')}</label><input className="input input-sm" value={cn.reason} onChange={(e) => setCn({ ...cn, reason: e.target.value })} /></div>
                </div>
                <button className="btn btn-outline btn-sm mt-1" disabled={!cn.invoiceId} onClick={() => run('cn', () => issueCreditNote({ invoiceId: cn.invoiceId, amount: cn.amount || undefined, reason: cn.reason }), (r) => ({ key: 'Credit note {id} issued.', vars: { id: r.id } }))}><Receipt size={14} /> {t('Issue credit note')}</button>
              </div>
            )}
            {isManager && (
              <div className="card-soft mt-2"><b><BadgePercent size={15} /> {t('Special discount (manager only)')}</b>
                {u.specialDiscount && <p className="mb-1">{t('Current: {v} · used {n} of {m}', { v: u.specialDiscount.type === 'percent' ? `${u.specialDiscount.value}%` : formatMoney(u.specialDiscount.value), n: u.specialDiscount.used || 0, m: u.specialDiscount.cycles || '∞' })} <button className="link-btn" onClick={() => setSpecialDiscount(u.id, null)}>{t('Remove')}</button></p>}
                <div className="form-grid">
                  <div className="field"><label>{t('Type')}</label><select className="input input-sm" value={disc.type} onChange={(e) => setDisc({ ...disc, type: e.target.value })}><option value="percent">{t('Percentage')}</option><option value="amount">{t('Amount')}</option></select></div>
                  <div className="field"><label>{t('Value')}</label><input className="input input-sm" type="number" dir="ltr" value={disc.value} onChange={(e) => setDisc({ ...disc, value: e.target.value })} /></div>
                  <div className="field"><label>{t('For how many invoices (0 = always)')}</label><input className="input input-sm" type="number" dir="ltr" value={disc.cycles} onChange={(e) => setDisc({ ...disc, cycles: e.target.value })} /></div>
                  <div className="field"><label>{t('Note')}</label><input className="input input-sm" value={disc.note} onChange={(e) => setDisc({ ...disc, note: e.target.value })} /></div>
                </div>
                <button className="btn btn-outline btn-sm mt-1" onClick={() => run('disc', () => setSpecialDiscount(u.id, disc), 'Special discount saved. It shows as its own line and commission is calculated after it.')}>{t('Save discount')}</button>
              </div>
            )}
            {isManager && u.subscription?.ledger && (
              <div className="card-soft mt-2"><b><Clock size={15} /> {t('Billing cycle (demo controls)')}</b>
                <p className="muted mb-1" style={{ fontSize: 13 }}>{t('Runs the monthly renewal now: closes the month, carries over unused documents, bills extra documents and charges the saved card.')}</p>
                <div className="flex gap-1 wrap">
                  <button className="btn btn-outline btn-sm" disabled={busy === 'ren'} onClick={() => run('ren', () => runRenewal(u.id), (r) => (r.ended ? 'Auto-renewal was off: the subscription ended.' : r.invoice ? { key: r.paid ? 'Renewed: {no} paid.' : 'Payment failed: {no} unpaid, grace period started.', vars: { no: r.invoice.id } } : 'Nothing to bill this cycle.'))}>{busy === 'ren' ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />} {t('Run renewal now')}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => run('renf', () => runRenewal(u.id, { forceFail: true }), 'Payment failed: grace period started.')}>{t('Run with a failed payment')}</button>
                  {u.subscription.status === 'Past due' && <><button className="btn btn-outline btn-sm" onClick={() => run('g1', () => graceTick(u.id), 'Daily reminder sent.')}>{t('Send daily reminder')}</button><button className="btn btn-danger btn-sm" onClick={() => run('g2', () => graceTick(u.id, { endNow: true }), 'Grace period ended: account suspended.')}>{t('End grace period')}</button></>}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'partner' && (
          <>
            {partner ? <div className="kv-grid"><div><span>{t('Partner')}</span><b>{partner.name}</b></div><div><span>{t('How')}</span><b>{t(u.partner.method)}</b></div><div><span>{t('Since')}</span><b>{fmtDate(u.partner.at, locale)}</b></div><div><span>{t('Partner may see invoices')}</span><b>{t(u.partnerConsent ? 'Yes' : 'No')}</b></div></div> : <p className="muted">{t('No partner.')}</p>}
            {isManager && (
              <div className="card-soft mt-2"><b><Handshake size={15} /> {t('Move to a partner (manager decision)')}</b>
                <div className="flex gap-1 mt-1"><select className="input input-sm" value={transfer} onChange={(e) => setTransfer(e.target.value)}><option value="">—</option>{getPartners().filter((p) => p.status === 'Active').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn btn-outline btn-sm" disabled={!transfer} onClick={() => run('tr', () => attributeCustomer(u.id, transfer, 'Transfer', { force: true }), 'Customer moved. Commission applies to new payments only.')}>{t('Move')}</button></div>
              </div>
            )}
          </>
        )}

        {tab === 'history' && <ul className="tl-mini">{[...(u.stageHistory || [])].reverse().map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · {t(h.from || '—')} → <b>{t(h.to)}</b> · {h.by}{h.note ? ` · ${t(h.note)}` : ''}</li>)}</ul>}
        {doc && <Modal title={doc.id} icon={Receipt} wide onClose={() => setDoc(null)}><TaxDoc doc={doc} /></Modal>}
      </aside>
    </div>
  );
}
