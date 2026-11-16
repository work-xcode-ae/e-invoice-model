// Customer portal (CUS-01..CUS-06, REG-06..REG-10, BIL-04..BIL-12).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Upload, CheckCircle2, AlertTriangle, AlertCircle, Loader2, RefreshCcw, ExternalLink, FileText, Download, Eye, Link2, Unlink,
  ArrowRightLeft, ShieldCheck, CreditCard, Power, CalendarClock, Info, Gift, Layers, TrendingUp, Clock, BadgePercent,
  KeyRound, Handshake, LifeBuoy, ArrowUpCircle, ArrowDownCircle, X, Printer, Receipt, Landmark,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { StageTracker, TaxDoc, downloadDocPdf, Modal, E_STATUS_BADGE } from '../../components/Brd';
import { stageOf, nextStep, requiredDocs, uploadDocument, confirmAuthorisation, requestService, consultingBalance, requestConsulting, pendingPolicies, acceptPolicies, STAGE_BADGE } from '../../services/lifecycle';
import { usageSummary } from '../../services/usage';
import { syncUsage } from '../../services/integration';
import { docsOf } from '../../services/modelDocs';
import { setAutoRenew, saveCard, tokenizeCard, payOpenInvoice, getOrders, upgradeCart } from '../../services/billing';
import { scheduleDowngrade, cancelPendingChange, updateUser, upgradeQuote } from '../../services/api';
import { getPlatform, currentPolicy } from '../../services/platform';
import { getPartner, setPartnerConsent } from '../../services/partners';
import { packages, getPackage, formatMoney } from '../../data/packages';
import { planAction } from '../../data/planActions';
import { fmtDate, fmtDateTime, msg, timeAgo } from '../../utils/format';
import RefundSection, { LockedNotice } from './Refund';
import { BankDetails } from '../Cart';

const lineText = (t, l) => (typeof l.desc === 'string' ? t(l.desc) : t(l.desc.key, { ...(l.desc.vars || {}), name: t(l.desc.vars?.name), period: t(l.desc.vars?.period), type: t(l.desc.vars?.type) }));

/* ================= Billing portal single sign-on (CUS-06, REG-08) ================= */
export function PortalButton({ user, block = false }) {
  const { t } = useLang();
  const { can } = useAuth();
  const [opening, setOpening] = useState(false);
  const stage = stageOf(user);
  const ok = stage === 'Active' && can('portal');
  const reason = !can('portal') ? 'Your role cannot open the billing portal.' : stage === 'Suspended' ? 'Your account is suspended. Pay the open invoice to resume.' : stage === 'Disconnected' ? 'Your account is disconnected.' : 'Available once your account is active ({stage}).';
  const open = () => {
    setOpening(true);
    setTimeout(() => { setOpening(false); window.open(`${getPlatform().sso.portalUrl}/sso?token=demo-${user.id.slice(0, 8)}`, '_blank', 'noopener'); }, 900);
  };
  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: block ? 'stretch' : 'start' }}>
      <button className={`btn sso-btn ${block ? 'btn-block btn-lg' : ''}`} disabled={!ok || opening} onClick={open} title={ok ? '' : t(reason, { stage: t(stage) })}>
        {opening ? <><Loader2 size={16} className="spin" /> {t('Signing you in…')}</> : <><ExternalLink size={16} /> {t('Open billing portal')}</>}
      </button>
      {!ok && <small className="muted">{t(reason, { stage: t(stage) })}</small>}
    </div>
  );
}

/* ================= Terms gate: a new version must be accepted at sign-in (REG-04) ================= */
export function TermsGate({ user }) {
  const { t, lang } = useLang();
  const { me } = useAuth();
  useDbVersion();
  const [ticks, setTicks] = useState({});
  const pending = pendingPolicies(user, me?.id);
  if (!pending.length) return null;
  const all = pending.every((p) => ticks[p.key]);
  return (
    <Modal title={t('Updated terms')} icon={ShieldCheck} onClose={() => {}} wide footer={<button className="btn btn-primary" disabled={!all} onClick={() => acceptPolicies(user.id, { id: me.id, name: me.name }, pending.map((p) => p.key))}>{t('Accept and continue')}</button>}>
      <p>{t('Please read and accept the current version to continue.')}</p>
      {pending.map((p) => {
        const v = currentPolicy(p.key);
        return (
          <div key={p.key} className="mb-2">
            <div className="flex between items-center mb-1"><b>{lang === 'ar' ? p.titleAr : t(p.title)}</b><span className="badge gray">{t('Version {v}', { v: p.version })}</span></div>
            <div className="terms-box">{lang === 'ar' ? v.ar : v.en}</div>
            <label className="checkbox mt-1"><input type="checkbox" checked={!!ticks[p.key]} onChange={(e) => setTicks({ ...ticks, [p.key]: e.target.checked })} /> {t('I accept version {v}.', { v: p.version })}</label>
          </div>
        );
      })}
    </Modal>
  );
}

/* ================= Overview for phase 1 (REG-09) ================= */
export function PortalOverview({ user, setTab }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  useDbVersion();
  const stage = stageOf(user);
  const ns = nextStep(user);
  const u = usageSummary(user.subscription);
  const docs = docsOf(user.id).slice(0, 4);
  const go = (a) => (a === 'packages' ? null : a === 'portal' ? null : setTab(a));
  return (
    <>
      <div className="card mb-2">
        <div className="flex between items-center wrap gap-1 mb-2"><h3 className="mb-0">{t('Account stage')}</h3><span className={`badge ${STAGE_BADGE[stage]}`}>{t(stage)}</span></div>
        <StageTracker stage={stage} />
      </div>
      {ns && (
        <div className="next-step mb-2">
          <div><h3>{t('Next step')}</h3><p>{msg(t, ns, locale)}</p></div>
          {ns.action === 'packages' && can('billing') && <Link to="/packages" className="btn btn-white">{t('Choose package')}</Link>}
          {ns.action === 'portal' && <PortalButton user={user} />}
          {['journey', 'plan'].includes(ns.action) && <button className="btn btn-white" onClick={() => go(ns.action)}>{t(ns.action === 'plan' ? 'Pay now' : 'Continue')}</button>}
        </div>
      )}
      <div className="dash-grid">
        <div className="card">
          <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Usage this month')}</h3><button className="link-btn" onClick={() => setTab('usage')}>{t('Details')} →</button></div>
          {u ? <UsageTiles u={u} compact /> : <p className="muted mb-0">{t('Usage appears after activation, when your subscription year starts.')}</p>}
        </div>
        <div className="card">
          <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Model invoices')}</h3>{can('modelInvoices') && <button className="link-btn" onClick={() => setTab('invoices-model')}>{t('View all')} →</button>}</div>
          <ul className="tl-mini">
            {docs.map((d) => <li key={d.id}><b dir="ltr">{d.id}</b> · {fmtDate(d.date, locale)} · {formatMoney(d.total)} · <span className={`badge ${d.status === 'Paid' || d.status === 'Issued' ? 'green' : 'orange'}`}>{t(d.status)}</span></li>)}
            {!docs.length && <li className="muted">{t('No documents yet.')}</li>}
          </ul>
        </div>
      </div>
      <div className="dash-grid mt-2">
        <LinkingCard user={user} compact />
        <div className="card">
          <h3>{t('Your plan')}</h3>
          {user.subscription ? (
            <div className="kv-grid">
              <div><span>{t('Package')}</span><b>{t(user.subscription.packageName)}</b></div>
              <div><span>{t('Billing')}</span><b>{t(user.subscription.billing || 'Monthly')}</b></div>
              <div><span>{t('Subscription year')}</span><b>{u ? `${fmtDate(u.yearStart, locale)} – ${fmtDate(u.yearEnd, locale)}` : t('Starts on activation')}</b></div>
              <div><span>{t('Auto-renewal')}</span><b>{t(user.subscription.autoRenew ? 'On' : 'Off')}</b></div>
            </div>
          ) : <p className="muted">{t('No package yet.')}</p>}
        </div>
      </div>
    </>
  );
}

/* ================= Journey: documents, linking, service requests ================= */
export function Journey({ user }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  useDbVersion();
  const stage = stageOf(user);
  const [busy, setBusy] = useState('');
  const docs = requiredDocs(user);
  const upload = async (id, file) => { if (!file) return; setBusy(id); await uploadDocument(user.id, id, file.name); setBusy(''); };
  return (
    <>
      <div className="card mb-2"><StageTracker stage={stage} /></div>
      {stage === 'Awaiting payment' && <div className="alert info mb-2"><Info size={18} /> {t('Choose a package and pay first. Your application is submitted only after payment.')} {can('billing') && <Link to="/packages">{t('Choose package')}</Link>}</div>}
      <div className="dash-grid">
        <div className="card">
          <h3>{t('Documents')}</h3>
          <p className="muted" style={{ fontSize: 14 }}>{t('Upload clear copies. If something is missing, our team completes it with you — applications are never rejected.')}</p>
          {docs.map((d) => {
            const up = (user.documents || []).find((x) => x.id === d.id);
            const st = up?.status || 'Not uploaded';
            return (
              <div className="doc-row" key={d.id}>
                <FileText size={20} color="#64748b" />
                <div className="grow"><b>{t(d.label)}</b>{!d.required && <span className="muted"> · {t('optional')}</span>}<small>{up ? `${up.fileName} · ${fmtDate(up.uploadedAt, locale)}` : t(d.note || 'Not uploaded yet')}</small>{st === 'Missing' && up?.note && <small className="text-danger">{up.note}</small>}</div>
                <span className={`badge ${st === 'Accepted' ? 'green' : st === 'Missing' ? 'red' : st === 'Uploaded' ? 'blue' : 'gray'}`}>{t(st === 'Missing' ? 'Needed again' : st)}</span>
                {can('company') && stage !== 'Awaiting payment' && st !== 'Accepted' && (
                  <label className="btn btn-outline btn-sm">{busy === d.id ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {t(up ? 'Replace' : 'Upload')}<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => upload(d.id, e.target.files[0])} /></label>
                )}
              </div>
            );
          })}
        </div>
        <LinkingCard user={user} />
      </div>
      <ServiceRequests user={user} />
      <div className="card mt-2">
        <h3>{t('History')}</h3>
        <ul className="tl-mini">
          {[...(user.stageHistory || [])].reverse().map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · <b>{t(h.to)}</b>{h.note ? ` · ${t(h.note)}` : ''} · <span className="muted">{h.by}</span></li>)}
        </ul>
      </div>
    </>
  );
}

function LinkingCard({ user, compact }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const l = user.linking || { status: 'Not started' };
  const stage = stageOf(user);
  const confirm = async () => { setBusy(true); setRes(await confirmAuthorisation(user.id)); setBusy(false); };
  return (
    <div className="card">
      <div className="flex between items-center mb-2"><h3 className="mb-0">{t('EmaraTax linking')}</h3><span className={`badge ${l.status === 'Linked' ? 'green' : l.status === 'Failed' ? 'red' : l.status === 'Unlinked' ? 'gray' : 'orange'}`}>{t(l.status)}</span></div>
      <div className="kv-grid">
        <div><span>{t('Peppol ID')}</span><b dir="ltr">{l.peppolId || '—'}</b></div>
        <div><span>{t('TIN')}</span><b dir="ltr">{user.company?.tin || '—'}</b></div>
        {!compact && <div><span>{t('Verified')}</span><b>{l.verifiedAt ? fmtDateTime(l.verifiedAt, locale) : '—'}</b></div>}
        {!compact && <div><span>{t('Registered in SMP')}</span><b>{t(l.smpRegistered ? 'Yes' : 'No')}</b></div>}
      </div>
      {l.peppolId && <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Read only. Your Peppol ID comes from the technical partner and cannot be edited.')}</p>}
      {!compact && stage === 'Awaiting linking' && (
        <>
          <ol className="req-list mt-2" style={{ paddingInlineStart: 18 }}>
            <li>{t('Sign in to EmaraTax with the taxable person account.')}</li>
            <li>{t('Open E-invoicing → Service provider and choose Model Financial Consulting.')}</li>
            <li>{t('Confirm the authorisation, then come back and press the button below.')}</li>
          </ol>
          {l.status === 'Failed' && <div className="alert warn mt-1"><AlertTriangle size={16} /> {t(l.lastError || 'Retrieval failed.')} {t('Our team was notified and will contact you.')}</div>}
          {can('linking') && <button className="btn btn-primary mt-2" disabled={busy || l.status === 'Retrieving'} onClick={confirm}>{busy ? <><Loader2 size={15} className="spin" /> {t('Retrieving your Peppol ID…')}</> : <><Link2 size={15} /> {t('I have authorised Model in EmaraTax')}</>}</button>}
          {res?.ok && <div className="alert success mt-1"><CheckCircle2 size={16} /> {t('Peppol ID {id} retrieved. Our team will activate your account.', { id: res.peppolId })}</div>}
        </>
      )}
    </div>
  );
}

function ServiceRequests({ user }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const [kind, setKind] = useState(null);
  const [provider, setProvider] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const stage = stageOf(user);
  if (!['Active', 'Awaiting linking', 'Suspended', 'Disconnected'].includes(stage)) return null;
  const submit = async () => { setBusy(true); await requestService(user.id, { kind, newProvider: provider, note }); setBusy(false); setKind(null); setProvider(''); setNote(''); };
  return (
    <div className="card mt-2">
      <h3>{t('Re-verify, unlink or move provider')}</h3>
      <p className="muted" style={{ fontSize: 14 }}>{t('Requests are carried out immediately and are never held back for unpaid amounts. Your archive stays available for {n} days, then on request.', { n: getPlatform().durations.archiveDays })}</p>
      {can('linking') && stage !== 'Disconnected' && (
        <div className="flex gap-1 wrap">
          <button className="btn btn-outline btn-sm" onClick={() => setKind('Re-verify')}><RefreshCcw size={14} /> {t('Re-verify')}</button>
          <button className="btn btn-outline btn-sm" onClick={() => setKind('Unlink')}><Unlink size={14} /> {t('Unlink')}</button>
          <button className="btn btn-outline btn-sm" onClick={() => setKind('Move provider')}><ArrowRightLeft size={14} /> {t('Move to another provider')}</button>
        </div>
      )}
      {kind && (
        <div className="card-soft mt-2">
          <b>{t(kind)}</b>
          {kind === 'Move provider' && <div className="field mt-1"><label>{t('New provider')}</label><input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} /></div>}
          <div className="field mt-1"><label>{t('Note (optional)')}</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="flex gap-1 mt-1"><button className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>{t('Send request')}</button><button className="btn btn-outline btn-sm" onClick={() => setKind(null)}>{t('Cancel')}</button></div>
        </div>
      )}
      {(user.serviceRequests || []).length > 0 && (
        <div className="table-wrap mt-2"><table><thead><tr><th>{t('Request')}</th><th>{t('Date')}</th><th>{t('Status')}</th><th>{t('Steps')}</th></tr></thead>
          <tbody>{user.serviceRequests.map((r) => <tr key={r.id}><td><b>{t(r.kind)}</b>{r.newProvider ? ` → ${r.newProvider}` : ''}</td><td>{fmtDate(r.requestedAt, locale)}</td><td><span className={`badge ${r.status === 'Done' ? 'green' : r.status === 'Failed' ? 'red' : 'orange'}`}>{t(r.status)}</span></td><td className="muted" style={{ fontSize: 12.5 }}>{r.steps.map((s) => t(s.action, { provider: r.newProvider })).join(' → ')}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

/* ================= Usage (CUS-01, BIL-04, BIL-05) ================= */
function Tile({ icon: Icon, label, used, total, note, color }) {
  const { t } = useLang();
  const pct = total ? Math.min(1, used / total) : 0;
  return (
    <div className="usage-tile">
      <span className="flex items-center gap-1"><Icon size={15} /> {t(label)}</span>
      <strong dir="ltr">{total === null ? used.toLocaleString() : `${used.toLocaleString()} / ${total.toLocaleString()}`}</strong>
      {total !== null && <span className="ub"><i style={{ width: `${pct * 100}%`, background: color }} /></span>}
      {total !== null && <small>{t('{n} left', { n: Math.max(0, total - used).toLocaleString() })}</small>}
      {note && <small>{note}</small>}
    </div>
  );
}

export function UsageTiles({ u, compact }) {
  const { t, locale } = useLang();
  return (
    <>
      <div className="usage-tiles">
        <Tile icon={Gift} label="Free this year" used={u.free.used} total={u.free.total} color="#16a34a" note={compact ? null : t('Resets {date}', { date: fmtDate(u.yearEnd, locale) })} />
        <Tile icon={CalendarClock} label="This month" used={u.month.used} total={u.month.total} color="#1a86a6" note={compact ? null : t('{from} – {to}', { from: fmtDate(u.periodStart, locale), to: fmtDate(u.periodEnd, locale) })} />
        <Tile icon={Layers} label="Carried over" used={u.carry.used} total={u.carry.total} color="#c99b5b" note={compact ? null : t('Lapses on {date}', { date: fmtDate(u.carry.expires, locale) })} />
        <Tile icon={TrendingUp} label="Extra documents" used={u.overage.count} total={null} color="#ef4444" note={t('{amount} on your next invoice', { amount: formatMoney(u.overage.amount) })} />
      </div>
      {!compact && <p className="usage-order mt-2 mb-0">{t('Order of use:')} <b>{t('Free')}</b> → <b>{t('This month')}</b> → <b>{t('Carried over')}</b> → <b>{t('Extra')}</b></p>}
    </>
  );
}

export function Usage({ user }) {
  const { t, locale } = useLang();
  useDbVersion();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [got, setGot] = useState(null);
  const u = usageSummary(user.subscription);
  if (!u) return <div className="card"><h3>{t('Usage')}</h3><p className="muted mb-0">{t('Usage appears after activation, when your subscription year starts.')}</p></div>;
  const refresh = async () => { setBusy(true); setErr(''); try { setGot(await syncUsage(user.id, { manual: true })); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const pct = u.allowance ? (u.used + u.overage.count) / u.allowance : 0;
  return (
    <>
      <div className="card mb-2">
        <div className="flex between items-center wrap gap-1 mb-2">
          <div><h3 className="mb-0">{t('Documents sent')}</h3><span className="muted" style={{ fontSize: 13 }}>{t('Last reading from the technical partner: {time}', { time: timeAgo(u.lastSync, t) })}</span></div>
          <button className="btn btn-outline btn-sm" onClick={refresh} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />} {t('Refresh now')}</button>
        </div>
        {got && <div className="alert success mb-2"><CheckCircle2 size={16} /> {t('{n} new document(s) since the last reading.', { n: got.newDocs })}</div>}
        {err && <div className="alert error mb-2"><AlertCircle size={16} /> {errText(t, err)}</div>}
        {pct >= 1 ? <div className="alert warn mb-2"><AlertTriangle size={16} /> {t('You have used all of this month’s documents. Sending continues; extra documents are billed at {price} each.', { price: formatMoney(u.overage.price) })}</div>
          : pct >= 0.8 ? <div className="alert warn mb-2"><AlertTriangle size={16} /> {t('You have used {pct}% of your documents this month.', { pct: Math.round(pct * 100) })}</div> : null}
        <UsageTiles u={u} />
      </div>
      <div className="card">
        <h3>{t('How documents are counted')}</h3>
        <ul className="req-list">
          <li><CheckCircle2 size={16} /> {t('Only documents you send count. Each invoice or credit note is one document.')}</li>
          <li><CheckCircle2 size={16} /> {t('Documents you receive are free.')}</li>
          <li><CheckCircle2 size={16} /> {t('Unused monthly documents carry over until {date}, the end of your subscription year.', { date: fmtDate(u.yearEnd, locale) })}</li>
          <li><CheckCircle2 size={16} /> {t('Sending never stops. Extra documents are added to your next monthly invoice.')}</li>
        </ul>
        <p className="muted mb-0" style={{ fontSize: 13 }}>{t('Total sent since activation: {n}', { n: u.sentTotal.toLocaleString() })}</p>
      </div>
    </>
  );
}

/* ================= Model invoices and credit notes (CUS-03, INV-02) ================= */
export function ModelInvoices({ user }) {
  const { t, locale } = useLang();
  useDbVersion();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const docs = docsOf(user.id);
  const pdf = async () => { setBusy(true); try { await downloadDocPdf(open); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Invoices and credit notes from Model')}</h3><span className="muted" style={{ fontSize: 13 }}>{t('Emailed to {email}', { email: user.email })}</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Number')}</th><th>{t('Type')}</th><th>{t('Date')}</th><th>{t('Total')}</th><th>{t('Payment')}</th><th>{t('E-invoice')}</th><th /></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="row-click" onClick={() => setOpen(d)}>
                <td><b dir="ltr">{d.id}</b>{d.refInvoice && <small className="muted" style={{ display: 'block' }}>{t('for {id}', { id: d.refInvoice })}</small>}</td>
                <td>{t(d.type)}</td>
                <td>{fmtDate(d.date, locale)}</td>
                <td dir="ltr"><b>{d.type === 'Credit note' ? '−' : ''}{formatMoney(d.total)}</b></td>
                <td><span className={`badge ${['Paid', 'Issued'].includes(d.status) ? 'green' : 'orange'}`}>{t(d.status)}</span></td>
                <td><span className={`badge ${E_STATUS_BADGE[d.einvoice?.status] || 'gray'}`}>{t(d.einvoice?.status || '—')}</span></td>
                <td><button className="icon-btn" aria-label={t('View')}><Eye size={16} /></button></td>
              </tr>
            ))}
            {!docs.length && <tr><td colSpan="7" className="muted center" style={{ padding: 24 }}>{t('No documents yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted mt-2 mb-0" style={{ fontSize: 12.5 }}>{t('Issued documents cannot be changed. Corrections are made with a credit note that refers to the original invoice.')}</p>
      {open && (
        <Modal title={open.id} icon={Receipt} onClose={() => setOpen(null)} wide footer={<><button className="btn btn-outline" onClick={() => window.print()}><Printer size={15} /> {t('Print')}</button><button className="btn btn-primary" onClick={pdf} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />} {t('Download PDF')}</button></>}>
          <TaxDoc doc={open} />
          <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('E-invoice: {status}', { status: t(open.einvoice?.status || '—') })}{open.einvoice?.status === 'Awaiting linking' ? ` · ${t('Sent automatically once your account is linked.')}` : ''}</p>
        </Modal>
      )}
    </div>
  );
}

/* ================= Plan & billing (BIL-07..BIL-10, CUS-04) ================= */
export function PlanBilling({ user, onSaved, initialDowngrade }) {
  const { t, locale } = useLang();
  const { setCart, can } = useAuth();
  const navigate = useNavigate();
  useDbVersion();
  const s = user.subscription;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(initialDowngrade || null);
  const [cardForm, setCardForm] = useState(null);
  const [payDoc, setPayDoc] = useState(null);
  const orders = getOrders().filter((o) => o.userId === user.id && o.status === 'Awaiting payment confirmation');

  if (!s) {
    return (
      <>
        {orders.map((o) => <PendingOrder key={o.id} o={o} />)}
        <div className="card"><h3>{t('No active package')}</h3><p>{t('Choose a package to submit your application.')}</p><Link to="/packages" className="btn btn-primary mt-2">{t('View packages')}</Link></div>
      </>
    );
  }
  const current = getPackage(s.packageId);
  const u = usageSummary(s);
  const unpaid = docsOf(user.id).filter((d) => d.type === 'Invoice' && d.status === 'Unpaid');
  const doUpgrade = (pkg) => { setCart(upgradeCart(user, pkg.id)); navigate('/cart'); };
  const doDowngrade = async (pkg) => { setBusy(pkg.id); setError(''); try { onSaved(await scheduleDowngrade(user.id, pkg.id)); setConfirm(null); } catch (e) { setError(e); } finally { setBusy(null); } };
  const undo = async () => { setBusy('undo'); onSaved(await cancelPendingChange(user.id)); setBusy(null); };
  const saveNewCard = () => { try { const c = tokenizeCard(cardForm); saveCard(user.id, c); setCardForm(null); setError(''); } catch (e) { setError(e); } };
  const pay = async (doc) => { setBusy(doc.id); setError(''); try { onSaved(await payOpenInvoice(user.id, doc.id)); setPayDoc(null); } catch (e) { setError(e); setPayDoc(doc); } finally { setBusy(null); } };
  const canChange = !s.locked && s.ledger && ['Active', 'Past due'].includes(s.status);

  return (
    <>
      {orders.map((o) => <PendingOrder key={o.id} o={o} />)}
      {unpaid.map((d) => (
        <div key={d.id} className="alert error mb-2" style={{ alignItems: 'center' }}>
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{t('Invoice {no} for {amount} is not paid.', { no: d.id, amount: formatMoney(d.total) })} {s.graceUntil && t('Pay by {date} to avoid suspension. Sending continues meanwhile.', { date: fmtDate(s.graceUntil, locale) })}</span>
          {can('card') && <button className="btn btn-danger btn-sm" disabled={busy === d.id} onClick={() => pay(d)}>{busy === d.id ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />} {t('Pay now')}</button>}
        </div>
      ))}
      {payDoc && <div className="card mb-2"><b>{t('Pay with another card')}</b><CardForm onCancel={() => setPayDoc(null)} onSave={async (c) => { try { const tok = tokenizeCard(c); setBusy(payDoc.id); onSaved(await payOpenInvoice(user.id, payDoc.id, tok)); setPayDoc(null); setError(''); } catch (e) { setError(e); } finally { setBusy(null); } }} /></div>}

      <div className="plan-hero card">
        <div>
          <span className="plan-eyebrow">{t('Current plan')}</span>
          <h2 className="mb-0">{t(s.packageName)} <span className={`badge ${s.locked || ['Suspended', 'Past due'].includes(s.status) ? 'red' : s.status === 'Pending activation' ? 'orange' : 'green'}`} style={{ verticalAlign: 'middle' }}>{t(s.status)}</span></h2>
          <p className="mb-0">{t('{price} / month · {tx} documents a month · {users} users · {over} per extra document', { price: formatMoney(s.priceMonthly ?? current.price), tx: Number(current.transactions).toLocaleString(), users: s.usersLimit, over: formatMoney(s.overagePrice ?? current.overagePrice) })}</p>
        </div>
        <div className="plan-dates">
          <div><span>{t('Billing')}</span><b>{t(s.billing || 'Monthly')}</b></div>
          <div><span>{t('Year starts')}</span><b>{s.activatedAt ? fmtDate(s.activatedAt, locale) : t('On activation')}</b></div>
          <div><span>{t(s.autoRenew ? 'Next renewal' : 'Ends on')}</span><b>{s.ledger ? fmtDate(s.endDate, locale) : '—'}</b></div>
        </div>
      </div>

      {s.locked && <div className="mt-2"><LockedNotice /></div>}
      {error && <div className="alert error mt-2"><AlertCircle size={18} /> <span style={{ flex: 1 }}>{errText(t, error)}</span></div>}
      {s.pendingChange && (
        <div className="alert info mt-2" style={{ alignItems: 'center' }}>
          <CalendarClock size={18} /><span style={{ flex: 1 }}>{t('Your plan switches to {name} on {date}.', { name: t(s.pendingChange.packageName), date: fmtDate(s.pendingChange.effectiveDate, locale) })}</span>
          <button className="btn btn-outline btn-sm" onClick={undo} disabled={busy === 'undo'}><X size={14} /> {t('Cancel change')}</button>
        </div>
      )}

      <div className="dash-grid mt-2">
        <div className="card">
          <h3>{t('Payment card and renewal')}</h3>
          {user.card ? (
            <div className="flex items-center gap-1 mb-2"><CreditCard size={20} /> <b>{user.card.brand} •••• {user.card.last4}</b> <span className="muted">· {t('expires {exp}', { exp: user.card.exp })}</span></div>
          ) : <p className="muted">{t('No saved card.')}</p>}
          {can('card') && (cardForm ? <CardForm value={cardForm} onChange={setCardForm} onSave={saveNewCard} onCancel={() => setCardForm(null)} /> : <button className="btn btn-outline btn-sm" onClick={() => setCardForm({ number: '', exp: '', name: '' })}><CreditCard size={14} /> {t(user.card ? 'Replace card' : 'Add card')}</button>)}
          <div className="flex between items-center mt-2" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div><b>{t('Automatic renewal')}</b><p className="muted mb-0" style={{ fontSize: 13 }}>{t(s.autoRenew ? 'Renews with your saved card. Turn off to cancel at the end of the period.' : 'Off: your subscription ends at the end of the period.')}</p></div>
            {can('card') && !s.locked && <button className={`btn btn-sm ${s.autoRenew ? 'btn-outline' : 'btn-primary'}`} onClick={() => setAutoRenew(user.id, !s.autoRenew)}><Power size={14} /> {t(s.autoRenew ? 'Turn off' : 'Turn on')}</button>}
          </div>
          <p className="muted mt-1 mb-0" style={{ fontSize: 12 }}>{t('Card details are held by the payment gateway. The platform only keeps a token.')}</p>
        </div>
        <div className="card">
          <h3>{t('Discounts')}</h3>
          {user.specialDiscount ? <p><BadgePercent size={16} /> {t('Special discount: {v}', { v: user.specialDiscount.type === 'percent' ? `${user.specialDiscount.value}%` : formatMoney(user.specialDiscount.value) })}{user.specialDiscount.cycles ? ` · ${t('{n} of {m} invoices used', { n: user.specialDiscount.used || 0, m: user.specialDiscount.cycles })}` : ''}</p> : <p className="muted">{t('No discount on your account.')}</p>}
          <p className="muted mb-0" style={{ fontSize: 13 }}>{t('Only one discount applies per invoice and it is shown as its own line.')}</p>
          {u && <><h4 className="mt-2">{t('Next invoice estimate')}</h4><ul className="tl-mini"><li>{t(current.name)} · {formatMoney(s.priceMonthly ?? current.price)}</li>{u.overage.count > 0 && <li>{t('{n} extra documents', { n: u.overage.count })} · {formatMoney(u.overage.amount)}</li>}{s.prorationCredit > 0 && <li className="text-success">{t('First month prorated')} · −{formatMoney(s.prorationCredit)}</li>}</ul></>}
        </div>
      </div>

      {canChange && can('billing') && <>
        <h3 className="mt-3">{t('Change plan')}</h3>
        <div className="plan-options">
          {packages.filter((p) => !p.custom && p.active !== false).map((pkg) => {
            const act = planAction(s, pkg);
            const q = act === 'upgrade' ? upgradeQuote(s, pkg.id) : null;
            const isPending = s.pendingChange?.packageId === pkg.id;
            return (
              <div key={pkg.id} className={`plan-opt ${act === 'current' ? 'is-current' : ''} ${act === 'upgrade' ? 'is-up' : ''}`}>
                <div className="flex between items-center">
                  <strong className="plan-opt-name">{t(pkg.name)}</strong>
                  {act === 'current' && <span className="badge blue">{t('Current')}</span>}
                  {act === 'upgrade' && <span className="badge green"><ArrowUpCircle size={12} /> {t('Upgrade')}</span>}
                  {act === 'downgrade' && <span className="badge gray"><ArrowDownCircle size={12} /> {t('Downgrade')}</span>}
                </div>
                <div className="plan-opt-price">{formatMoney(pkg.price)}<span>{t('/mo')}</span></div>
                <ul><li><b>{Number(pkg.transactions).toLocaleString()}</b> {t('documents / month')}</li><li><b>{pkg.users}</b> {t('users')}</li><li>{formatMoney(pkg.overagePrice)} {t('per extra document')}</li></ul>
                {act === 'upgrade' && <><div className="plan-opt-note">{t('Pay {amount} now, prorated for {days} days. The new monthly documents are added at once.', { amount: formatMoney(q.amount), days: q.remainingDays })}</div><button className="btn btn-primary btn-block" onClick={() => doUpgrade(pkg)}>{t('Upgrade to {name}', { name: t(pkg.name) })}</button></>}
                {act === 'current' && <div className="plan-opt-note">{t('You\'re on this plan.')}</div>}
                {act === 'downgrade' && (isPending ? <div className="plan-opt-note">{t('Scheduled for {date}.', { date: fmtDate(s.pendingChange.effectiveDate, locale) })}</div>
                  : confirm === pkg.id ? <><div className="plan-opt-note warn">{t('Switches on {date}, with no refund for this period.', { date: fmtDate(s.endDate, locale) })}</div><div className="flex gap-1"><button className="btn btn-dark btn-sm" style={{ flex: 1 }} onClick={() => doDowngrade(pkg)} disabled={busy === pkg.id}>{busy === pkg.id ? <Loader2 size={14} className="spin" /> : t('Confirm')}</button><button className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>{t('Back')}</button></div></>
                  : <><div className="plan-opt-note">{t('Applies from your next billing cycle.')}</div><button className="btn btn-outline btn-block" onClick={() => setConfirm(pkg.id)}>{t('Switch to {name}', { name: t(pkg.name) })}</button></>)}
              </div>
            );
          })}
        </div>
      </>}

      <div className="card mt-3">
        <h3>{t('Payments')}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Date')}</th><th>{t('Description')}</th><th>{t('Method')}</th><th>{t('Invoice')}</th><th>{t('Amount')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>
              {(user.payments || []).slice().reverse().map((p) => (
                <tr key={p.id}><td>{fmtDate(p.date, locale)}</td><td>{typeof p.description === 'string' ? p.description : t(p.description.key, { ...p.description.vars, name: t(p.description.vars?.name) })}</td><td>{t(p.method || 'Card')}</td><td dir="ltr" className="muted">{p.invoiceId || '—'}</td><td><b>{formatMoney(p.total)}</b></td><td><span className={`badge ${p.status === 'Paid' ? 'green' : p.status === 'Failed' ? 'red' : 'gray'}`}>{t(p.status)}</span></td></tr>
              ))}
              {!(user.payments || []).length && <tr><td colSpan="6" className="muted">{t('No payments yet.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {can('refund') && <RefundSection />}
    </>
  );
}

function PendingOrder({ o }) {
  const { t, locale } = useLang();
  return (
    <div className="card mb-2">
      <div className="flex between items-center mb-1"><h3 className="mb-0"><Landmark size={18} /> {t('Order {id} · waiting for bank transfer', { id: o.id })}</h3><span className="badge orange">{t('Awaiting payment confirmation')}</span></div>
      <p className="muted">{t('Placed {date}. Your application is submitted once our manager confirms the transfer.', { date: fmtDate(o.createdAt, locale) })}</p>
      <BankDetails total={o.quote.total} reference={o.id} />
    </div>
  );
}

function CardForm({ value, onChange, onSave, onCancel }) {
  const { t } = useLang();
  const [own, setOwn] = useState({ number: '', exp: '', name: '' });
  const v = value || own; const set = onChange || setOwn;
  return (
    <div className="form-grid mt-1" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="field"><label>{t('Card number')}</label><input className="input" dir="ltr" value={v.number} onChange={(e) => set({ ...v, number: e.target.value })} placeholder="4242 4242 4242 4242" /></div>
      <div className="field"><label>{t('Expiry')}</label><input className="input" dir="ltr" value={v.exp} onChange={(e) => set({ ...v, exp: e.target.value })} placeholder="MM/YY" /></div>
      <div className="flex gap-1 full"><button className="btn btn-primary btn-sm" onClick={() => onSave(v)}>{t('Save card')}</button><button className="btn btn-outline btn-sm" onClick={onCancel}>{t('Cancel')}</button></div>
    </div>
  );
}

/* ================= Consulting services (BIL-12) ================= */
export function Consulting({ user }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  useDbVersion();
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(null);
  const bal = consultingBalance(user);
  const list = getPlatform().consulting;
  const ask = async (id) => { setBusy(id); setDone(await requestConsulting(user.id, id)); setBusy(''); };
  return (
    <>
      <div className="card mb-2">
        <h3>{t('Consulting benefits of your package')}</h3>
        <div className="kv-grid">
          <div><span>{t('Included hours this year')}</span><b>{bal.total}</b></div>
          <div><span>{t('Hours left')}</span><b>{bal.left}</b></div>
          <div><span>{t('Discount on extra services')}</span><b>{bal.discount}%</b></div>
        </div>
      </div>
      {done && <div className="alert success mb-2"><CheckCircle2 size={16} /> {t('Request {id} sent. Our team will contact you to schedule it.', { id: done.id })}</div>}
      <div className="grid grid-2">
        {list.map((s) => {
          const covered = Math.min(bal.left, s.hours);
          const price = +(s.price * ((s.hours - covered) / s.hours) * (1 - bal.discount / 100)).toFixed(2);
          return (
            <div className="card" key={s.id}>
              <h4>{t(s.name)}</h4>
              <p className="muted mb-1">{t('{h} hour(s) · list price {p}', { h: s.hours, p: formatMoney(s.price) })}</p>
              <p><b>{price === 0 ? t('Included in your package') : t('Your price: {p}', { p: formatMoney(price) })}</b>{covered > 0 && price > 0 ? ` · ${t('{h} h included', { h: covered })}` : ''}</p>
              {can('support') && <button className="btn btn-outline btn-sm" disabled={busy === s.id || !user.subscription} onClick={() => ask(s.id)}>{busy === s.id ? <Loader2 size={14} className="spin" /> : <LifeBuoy size={14} />} {t('Request')}</button>}
            </div>
          );
        })}
      </div>
      {(user.consulting || []).length > 0 && (
        <div className="card mt-2"><h3>{t('Your requests')}</h3>
          <div className="table-wrap"><table><thead><tr><th>{t('Service')}</th><th>{t('Date')}</th><th>{t('Price')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{user.consulting.map((r) => <tr key={r.id}><td>{t(r.name)}</td><td>{fmtDate(r.requestedAt, locale)}</td><td>{r.final ? formatMoney(r.final) : t('Included')}</td><td><span className="badge blue">{t(r.status)}</span></td></tr>)}</tbody></table></div>
        </div>
      )}
    </>
  );
}

/* ================= Security & legal (NFR-06, CUS-06, partner consent) ================= */
export function Security({ user }) {
  const { t, lang, locale } = useLang();
  const { member, can, me } = useAuth();
  useDbVersion();
  const p = getPlatform();
  const mine = member ? (user.teamUsers || []).find((m) => m.id === member.id) : user;
  const on = !!mine?.twoFA;
  const toggle = () => {
    if (member) updateUser(user.id, (u) => ({ teamUsers: (u.teamUsers || []).map((m) => (m.id === member.id ? { ...m, twoFA: !on } : m)) }));
    else updateUser(user.id, { twoFA: !on });
  };
  const partner = user.partner ? getPartner(user.partner.partnerId) : null;
  const myAcc = (user.acceptances || []).filter((a) => a.actorId === me?.id);
  return (
    <div className="dash-grid">
      <div className="card">
        <h3><KeyRound size={18} /> {t('Two-step verification')}</h3>
        <p className="muted">{t('Ask for a code sent to your email at every sign-in.')}</p>
        {p.features.customer2fa ? <button className={`btn btn-sm ${on ? 'btn-outline' : 'btn-primary'}`} onClick={toggle}>{t(on ? 'Turn off' : 'Turn on')}</button> : <p className="muted">{t('Not available.')}</p>}
        <span className={`badge ${on ? 'green' : 'gray'}`} style={{ marginInlineStart: 8 }}>{t(on ? 'On' : 'Off')}</span>
      </div>
      <div className="card">
        <h3><FileText size={18} /> {t('Terms you accepted')}</h3>
        <ul className="tl-mini">
          {myAcc.map((a, i) => <li key={i}><b>{lang === 'ar' ? p.policies[a.doc]?.titleAr : t(p.policies[a.doc]?.title)}</b> · v{a.version} · {fmtDateTime(a.at, locale)}</li>)}
          {!myAcc.length && <li className="muted">{t('No record yet.')}</li>}
        </ul>
        <div className="flex gap-1 wrap"><Link to="/terms" target="_blank" className="link-btn">{t('Terms and Conditions')}</Link><Link to="/disclaimer" target="_blank" className="link-btn">{t('Disclaimer')}</Link><Link to="/privacy" target="_blank" className="link-btn">{t('Privacy Policy')}</Link></div>
      </div>
      {partner && (
        <div className="card">
          <h3><Handshake size={18} /> {t('Your partner')}</h3>
          <p>{t('{name} referred your company.', { name: partner.name })}</p>
          <label className="checkbox"><input type="checkbox" disabled={!can('partnerConsent')} checked={!!user.partnerConsent} onChange={(e) => setPartnerConsent(user.id, e.target.checked)} /> {t('Allow {name} to see our Model invoices and tax data', { name: partner.name })}</label>
          <p className="muted mb-0" style={{ fontSize: 12.5 }}>{t('Without this, your partner only sees your account stage and linking status.')}</p>
        </div>
      )}
    </div>
  );
}
