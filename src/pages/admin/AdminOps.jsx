import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  RotateCcw, Ban, Pause, Play, CheckCircle2, XCircle, Loader2, Paperclip, Save, Undo2, AlertCircle, Trash2, Database, Plug,
} from 'lucide-react';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { queueItems, savePackage, resetPackages, packages, companies, saveAddon, addOns } from '../../services/admin';
import { adminOverview } from '../../services/reports';
import { formatMoney } from '../../data/packages';
import { retryInvoice, cancelInvoice, getSettings, saveSettings, MAX_RETRIES } from '../../services/invoices';
import { allRefunds, approveRefund, rejectRefund } from '../../services/refunds';
import { getLogs, clearLogs } from '../../services/logs';
import { getUserById } from '../../services/api';
import { fmtDate, fmtDateTime, timeAgo } from '../../utils/format';
import { PageTitle, Badge, UsageBar, AdminInvoices } from './Admin';
import { InvoiceDetail } from '../dashboard/Invoices';
import { getQvaliaConfig, saveQvaliaConfig } from '../../services/qvalia';
import { PROFILES, ENDPOINT_SCHEMES } from '../../data/ubl';

/* ====================== Invoices (with detail drawer) ====================== */
export function AdminInvoicesPage() {
  const [open, setOpen] = useState(null);
  useDbVersion();
  const inv = open ? (getUserById(open.userId)?.invoices || []).find((i) => i.id === open.id) : null;
  return (
    <>
      <AdminInvoices onOpen={(i) => setOpen({ userId: i.userId, id: i.id })} />
      <InvoiceDetail inv={inv} onClose={() => setOpen(null)} userId={open?.userId} />
    </>
  );
}

/* ====================== Queue monitor ====================== */
export function AdminQueue() {
  const { t } = useLang();
  useDbVersion();
  const items = queueItems();
  const settings = getSettings();
  const groups = ['Queued', 'Processing', 'Sent to White Label', 'Retrying', 'Failed'];

  return (
    <>
      <PageTitle title="Queue monitor" sub="Invoices waiting, in progress, retrying or failed. Updates live.">
        <button className={`btn btn-sm ${settings.paused ? 'btn-primary' : 'btn-outline'}`} onClick={() => saveSettings({ paused: !settings.paused })}>
          {settings.paused ? <><Play size={15} /> {t('Resume processing')}</> : <><Pause size={15} /> {t('Pause processing')}</>}
        </button>
      </PageTitle>
      {settings.paused && <div className="alert warn mb-2"><Pause size={18} /> {t('Background processing is paused. New invoices stay in the queue.')}</div>}
      <div className="queue-cols mb-2">
        {groups.map((g) => (
          <div key={g} className="card queue-col"><span>{t(g)}</span><strong dir="ltr">{items.filter((i) => i.status === g).length}</strong></div>
        ))}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Queue ID')}</th><th>{t('Invoice')}</th><th>{t('Company')}</th><th>{t('Status')}</th><th>{t('Retry count')}</th><th>{t('Last error')}</th><th>{t('Created')}</th><th /></tr></thead>
            <tbody>
              {items.slice(0, 120).map((i) => (
                <tr key={`${i.userId}-${i.id}`}>
                  <td dir="ltr">{i.queueId}</td><td dir="ltr"><strong>{i.id}</strong></td><td>{i.company}</td>
                  <td><Badge status={i.status} /></td>
                  <td dir="ltr">{i.retryCount} / {MAX_RETRIES}</td>
                  <td className="muted" dir="ltr" style={{ fontSize: 12.5 }}>{i.lastError || '—'}</td>
                  <td className="muted">{timeAgo(i.createdAt, t)}</td>
                  <td className="row-actions">
                    {i.status === 'Failed' && <button className="btn btn-outline btn-sm" onClick={() => retryInvoice(i.userId, i.id, 'admin')}><RotateCcw size={14} /> {t('Retry')}</button>}
                    {['Queued', 'Retrying'].includes(i.status) && <button className="icon-btn danger" onClick={() => cancelInvoice(i.userId, i.id)} aria-label={t('Cancel')}><Ban size={15} /></button>}
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan="8" className="center muted" style={{ padding: 28 }}>{t('The queue is empty.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted mt-1" style={{ fontSize: 12.5 }}>{t('Retry mechanism: if a send fails, it is retried automatically until it succeeds, up to {max} attempts. Duplicate sending is prevented (idempotency).', { max: MAX_RETRIES })}</p>
      </div>
    </>
  );
}

/* ====================== Refund requests (admin review) ====================== */
const CHECKLIST = ['Customer information', 'Payment details (Stripe)', 'Package usage (transactions)', 'Refund policy', 'Reason for refund', 'Supporting documents'];

export function AdminRefunds() {
  const { t, locale } = useLang();
  useDbVersion();
  const list = allRefunds();
  const [openId, setOpenId] = useState(list.find((r) => r.status === 'Pending')?.id || null);
  const [checks, setChecks] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const r = list.find((x) => x.id === openId);
  const allChecked = CHECKLIST.every((c) => checks[c]);

  const approve = async () => { setBusy('approve'); setError(null); try { await approveRefund(r.userId, r.id); } catch (e) { setError(e); } setBusy(''); };
  const reject = async () => { setBusy('reject'); setError(null); try { await rejectRefund(r.userId, r.id, note); setNote(''); } catch (e) { setError(e); } setBusy(''); };

  return (
    <>
      <PageTitle title="Refund requests" sub="Review, approve or reject refund requests. Approved refunds are processed via Stripe and lock the package." />
      <div className="refund-admin">
        <div className="card">
          <div className="table-wrap">
            <table className="table-click">
              <thead><tr><th>{t('Request')}</th><th>{t('Company')}</th><th>{t('Amount')}</th><th>{t('Date')}</th><th>{t('Status')}</th></tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id + x.userId} onClick={() => { setOpenId(x.id); setChecks({}); setNote(''); setError(null); }} className={x.id === openId ? 'row-on' : ''}>
                    <td dir="ltr"><strong>{x.id}</strong></td><td>{x.company}</td><td>{formatMoney(x.amount)}</td>
                    <td className="muted">{fmtDate(x.requestedAt, locale)}</td><td><Badge status={x.status} /></td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="5" className="center muted" style={{ padding: 28 }}>{t('No refund requests.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {r && (
          <div className="card">
            <div className="flex between items-center mb-2">
              <h3 className="mb-0" dir="ltr" style={{ textAlign: 'start' }}>{r.id}</h3><Badge status={r.status} />
            </div>
            <div className="kv-grid">
              <div><span>{t('Customer')}</span><b>{r.company}</b></div>
              <div><span>{t('Owner')}</span><b>{r.owner}</b></div>
              <div><span>{t('Package')}</span><b>{t(r.packageName)}</b></div>
              <div><span>{t('Amount')}</span><b>{formatMoney(r.amount)}</b></div>
              <div><span>{t('Payment ID')}</span><b dir="ltr">{r.paymentId}</b></div>
              <div><span>{t('Usage')}</span><b><UsageBar used={r.usage?.used || 0} limit={r.usage?.limit || 0} /></b></div>
              <div className="full"><span>{t('Reason')}</span><b>{t(r.reason)}</b></div>
              {r.comments && <div className="full"><span>{t('Comments')}</span><b>{r.comments}</b></div>}
              {r.attachments?.length > 0 && <div className="full"><span>{t('Attachments')}</span><b>{r.attachments.map((a) => <span key={a} className="chip-mini" dir="ltr"><Paperclip size={12} /> {a}</span>)}</b></div>}
              {r.stripeRefundId && <div className="full"><span>{t('Stripe refund ID')}</span><b dir="ltr">{r.stripeRefundId}</b></div>}
            </div>

            {r.status === 'Pending' && (
              <>
                <h4 className="mt-2">{t('Review checklist')}</h4>
                <div className="checklist-box">
                  {CHECKLIST.map((c) => (
                    <label key={c} className="checkbox"><input type="checkbox" checked={!!checks[c]} onChange={(e) => setChecks({ ...checks, [c]: e.target.checked })} /> {t(c)}</label>
                  ))}
                </div>
                <div className="field mt-2">
                  <label>{t('Note to customer (required to reject)')}</label>
                  <textarea className="input" style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                {error && <div className="alert error mt-1"><AlertCircle size={18} /> {errText(t, error)}</div>}
                <div className="flex gap-1 mt-2 wrap">
                  <button className="btn btn-success btn-sm" disabled={!allChecked || !!busy} onClick={approve} title={allChecked ? '' : t('Complete the checklist first')}>
                    {busy === 'approve' ? <><Loader2 size={15} className="spin" /> {t('Processing refund via Stripe…')}</> : <><CheckCircle2 size={15} /> {t('Approve & refund')}</>}
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={reject}>{busy === 'reject' ? <Loader2 size={15} className="spin" /> : <XCircle size={15} />} {t('Reject')}</button>
                </div>
                {!allChecked && <p className="muted mt-1" style={{ fontSize: 12.5 }}>{t('Tick every checklist item to enable approval.')}</p>}
              </>
            )}
            {r.status === 'Processing' && <div className="alert info mt-2"><Loader2 size={18} className="spin" /> {t('Processing refund via Stripe…')}</div>}

            <h4 className="mt-2">{t('History')}</h4>
            <ul className="tl-mini">
              {r.history.map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · <b>{t(h.status)}</b>{h.note ? ` · ${t(h.note, h.vars)}` : ''}</li>)}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

/* ====================== Packages ====================== */
export function AdminPackages() {
  const { t } = useLang();
  useDbVersion();
  const [drafts, setDrafts] = useState(() => Object.fromEntries(packages.map((p) => [p.id, { ...p }])));
  const [addonDrafts, setAddonDrafts] = useState(() => addOns.map((a) => ({ ...a })));
  const [saved, setSaved] = useState('');
  const ov = adminOverview();
  const set = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));
  const flash = (id) => { setSaved(id); setTimeout(() => setSaved(''), 1500); };
  const save = (id) => { savePackage(drafts[id]); flash(id); };
  const reset = () => { resetPackages(); setDrafts(Object.fromEntries(packages.map((p) => [p.id, { ...p }]))); setAddonDrafts(addOns.map((a) => ({ ...a }))); };

  return (
    <>
      <PageTitle title="Packages" sub="Set prices and limits, and see how each package is selling.">
        <button className="btn btn-outline btn-sm" onClick={reset}><Undo2 size={15} /> {t('Reset to defaults')}</button>
      </PageTitle>
      <div className="plan-options">
        {packages.map((p) => {
          const d = drafts[p.id];
          const st = ov.packages.find((x) => x.id === p.id);
          const changed = Number(d.price) !== p.price || Number(d.transactions) !== p.transactions || Number(d.users) !== p.users || (d.active !== false) !== (p.active !== false);
          return (
            <div key={p.id} className={`plan-opt ${d.active === false ? 'row-muted' : ''}`}>
              <div className="flex between items-center"><strong className="plan-opt-name">{t(p.name)}</strong>{p.active === false && <span className="badge gray">{t('Hidden from sale')}</span>}</div>
              <div className="pkg-mini-stats">
                <div><b dir="ltr">{st.active}</b><span>{t('active subscribers')}</span></div>
                <div><b dir="ltr">{formatMoney(st.mrr)}</b><span>{t('MRR')}</span></div>
                <div><b dir="ltr">{formatMoney(Math.round(st.revenue))}</b><span>{t('Sales · 30 days')}</span></div>
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field"><label>{t('Price (AED / month)')}</label><input className="input" type="number" dir="ltr" value={d.price} onChange={(e) => set(p.id, 'price', e.target.value)} /></div>
                <div className="field"><label>{t('Transactions / month')}</label><input className="input" type="number" dir="ltr" value={d.transactions} onChange={(e) => set(p.id, 'transactions', e.target.value)} /></div>
                <div className="field"><label>{t('Users')}</label><input className="input" type="number" dir="ltr" value={d.users} onChange={(e) => set(p.id, 'users', e.target.value)} /></div>
                <div className="field"><label>{t('Available for sale')}</label>
                  <select className="input" value={d.active === false ? 'no' : 'yes'} onChange={(e) => set(p.id, 'active', e.target.value === 'yes')}>
                    <option value="yes">{t('Yes')}</option><option value="no">{t('No')}</option>
                  </select></div>
              </div>
              {Number(d.price) !== p.price && st.active > 0 && <div className="alert info" style={{ fontSize: 13 }}>{t('MRR would change from {a} to {b} when all {n} subscribers renew.', { a: formatMoney(st.mrr), b: formatMoney(st.active * Number(d.price)), n: st.active })}</div>}
              <button className="btn btn-primary btn-sm" disabled={!changed && saved !== p.id} onClick={() => save(p.id)}>{saved === p.id ? <><CheckCircle2 size={15} /> {t('Saved')}</> : <><Save size={15} /> {t('Save')}</>}</button>
              <p className="muted mb-0" style={{ fontSize: 12.5 }}>{t('Changes apply to new purchases and renewals. Existing subscriptions keep their limits until renewal.')}</p>
            </div>
          );
        })}
      </div>

      <div className="card mt-2">
        <h3>{t('Add-on prices')}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{t('Extra invoices customers can buy during their current period.')}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Add-on')}</th><th>{t('Invoices')}</th><th>{t('Price (AED, excl. VAT)')}</th><th>{t('Price per invoice')}</th><th /></tr></thead>
            <tbody>
              {addonDrafts.map((a, i) => (
                <tr key={a.id}>
                  <td dir="ltr" className="muted">{a.id}</td>
                  <td><input className="input input-sm" type="number" dir="ltr" style={{ maxWidth: 110 }} value={a.transactions} onChange={(e) => setAddonDrafts((l) => l.map((x, k) => (k === i ? { ...x, transactions: e.target.value } : x)))} /></td>
                  <td><input className="input input-sm" type="number" dir="ltr" style={{ maxWidth: 110 }} value={a.price} onChange={(e) => setAddonDrafts((l) => l.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)))} /></td>
                  <td dir="ltr" className="muted">{formatMoney((Number(a.price) / Math.max(1, Number(a.transactions))).toFixed(2))}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => { saveAddon(a); flash(a.id); }}>{saved === a.id ? <CheckCircle2 size={15} /> : <Save size={15} />} {t(saved === a.id ? 'Saved' : 'Save')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ====================== Reports & logs ====================== */
const LOG_TABS = [
  ['transaction', 'Transaction logs'],
  ['wl', 'White Label responses'],
  ['error', 'Error logs'],
  ['activity', 'User activity'],
];

export function AdminLogs() {
  const { t, locale } = useLang();
  useDbVersion();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || 'transaction';
  const logs = getLogs(type);
  return (
    <>
      <PageTitle title="Reports & logs" sub="Transaction log, White Label responses, errors and user activity." />
      <div className="subtabs mb-2">
        {LOG_TABS.map(([k, label]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setParams({ type: k })}>{t(label)} <span className="subtab-count">{getLogs(k).length}</span></button>)}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Time')}</th><th>{t('Company')}</th><th>{t('Action')}</th><th>{t('Details')}</th></tr></thead>
            <tbody>
              {logs.slice(0, 200).map((l) => (
                <tr key={l.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.at, locale)}</td>
                  <td>{l.company || '—'}</td>
                  <td><b>{t(l.action, l.vars)}</b></td>
                  <td className="muted" dir="auto">{t(l.details, l.vars)}</td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan="4" className="center muted" style={{ padding: 28 }}>{t('No entries yet. Create or upload invoices to see activity here.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ====================== Settings ====================== */
export function AdminSettings() {
  const { t } = useLang();
  useDbVersion();
  const s = getSettings();
  const resetDemo = () => {
    try {
      ['mei_users', 'mei_logs', 'mei_seed_v', 'mei_settings', 'mei_packages', 'mei_session'].forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    window.location.href = '/login';
  };
  return (
    <>
      <PageTitle title="Settings" sub="Simulation controls for this demo build." />
      <div className="grid grid-2">
        <div className="card">
          <h3>{t('Background processing')}</h3>
          <div className="field mt-2">
            <label>{t('White Label success rate: {n}%', { n: Math.round(s.successRate * 100) })}</label>
            <input type="range" min="0" max="100" step="5" value={Math.round(s.successRate * 100)} onChange={(e) => saveSettings({ successRate: Number(e.target.value) / 100 })} />
            <span className="hint">{t('Lower it to see retries and failures in the queue monitor.')}</span>
          </div>
          <div className="field mt-2">
            <label>{t('Step duration: {n} s', { n: (s.phaseMs / 1000).toFixed(1) })}</label>
            <input type="range" min="500" max="6000" step="500" value={s.phaseMs} onChange={(e) => saveSettings({ phaseMs: Number(e.target.value) })} />
          </div>
          <div className="field mt-2">
            <label>{t('Retry delay: {n} s', { n: (s.retryMs / 1000).toFixed(0) })}</label>
            <input type="range" min="1000" max="20000" step="1000" value={s.retryMs} onChange={(e) => saveSettings({ retryMs: Number(e.target.value) })} />
            <span className="hint">{t('Production: retry every 5–10 minutes, max {max} attempts.', { max: MAX_RETRIES })}</span>
          </div>
        </div>
        <div className="card">
          <h3>{t('Demo data')}</h3>
          <p>{t('Clear logs or reset everything back to the original demo data.')}</p>
          <div className="flex gap-1 wrap mt-2">
            <button className="btn btn-outline btn-sm" onClick={clearLogs}><Trash2 size={15} /> {t('Clear logs')}</button>
            <button className="btn btn-danger btn-sm" onClick={resetDemo}><Database size={15} /> {t('Reset demo data')}</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ====================== Integrations (Qvalia) ====================== */
export function AdminIntegrations() {
  const { t } = useLang();
  useDbVersion();
  const cfg = getQvaliaConfig();
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);
  const set = (k) => (e) => saveQvaliaConfig({ [k]: e.target.value });

  const test = async () => {
    setTesting(true); setHealth(null);
    try {
      const r = await fetch(`${cfg.proxyUrl.replace(/\/$/, '')}/health`);
      const body = await r.json();
      setHealth({ ok: r.ok && body.apiKeyConfigured, body });
    } catch (e) { setHealth({ ok: false, body: { error: e.message } }); }
    setTesting(false);
  };

  return (
    <>
      <PageTitle title="Integrations" sub="Connection to Qvalia, the Peppol access point and PSP that delivers your invoices." />
      <div className="grid grid-2">
        <div className="card">
          <h3 className="flex items-center gap-1"><Plug size={18} /> {t('Qvalia Transaction API')}</h3>
          <div className="form-grid mt-2">
            <div className="field full"><label>{t('Mode')}</label>
              <div className="seg-choice two">
                <button type="button" className={cfg.mode === 'simulation' ? 'on' : ''} onClick={() => saveQvaliaConfig({ mode: 'simulation' })}><b>{t('Simulation')}</b> {t('Realistic responses, nothing is sent')}</button>
                <button type="button" className={cfg.mode === 'proxy' ? 'on' : ''} onClick={() => saveQvaliaConfig({ mode: 'proxy' })}><b>{t('Live (backend proxy)')}</b> {t('Sends to Qvalia through your server')}</button>
              </div>
            </div>
            <div className="field"><label>{t('Environment')}</label>
              <select className="input" value={cfg.environment} onChange={set('environment')}>
                <option value="test">{t('Test')} · api-test.qvalia.com</option>
                <option value="production">{t('Production')} · api.qvalia.com</option>
              </select></div>
            <div className="field"><label>{t('Account registration number')}</label>
              <input className="input" dir="ltr" placeholder="accountRegNo" value={cfg.accountRegNo} onChange={set('accountRegNo')} />
              <span className="hint">{t('Issued by Qvalia. Used in /transaction/{accountRegNo}/…')}</span></div>
            <div className="field"><label>{t('Invoice profile')}</label>
              <select className="input" value={cfg.profile} onChange={set('profile')}>
                {Object.entries(PROFILES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <span className="hint" dir="ltr">{PROFILES[cfg.profile]?.customizationId}</span></div>
            <div className="field"><label>{t('Body format')}</label>
              <select className="input" value={cfg.format} onChange={set('format')}>
                <option value="json">JSON (UBL JSON)</option>
                <option value="xml">UBL XML</option>
              </select></div>
            <div className="field"><label>{t('Default Peppol scheme')}</label>
              <select className="input" value={cfg.endpointScheme} onChange={set('endpointScheme')}>
                {ENDPOINT_SCHEMES.map((s) => <option key={s.code} value={s.code}>{s.code} · {t(s.label)}</option>)}
              </select></div>
            <div className="field"><label>{t('Delivery method')}</label>
              <select className="input" value={cfg.deliveryMethod} onChange={set('deliveryMethod')}>
                {['peppol', 'email', 'dynamic_routing'].map((d) => <option key={d} value={d}>{d}</option>)}
              </select></div>
            {cfg.mode === 'proxy' && (
              <div className="field full"><label>{t('Proxy URL')}</label>
                <div className="input-with-btn">
                  <input className="input" dir="ltr" value={cfg.proxyUrl} onChange={set('proxyUrl')} />
                  <button type="button" className="btn btn-outline btn-sm" onClick={test} disabled={testing}>{testing ? <Loader2 size={15} className="spin" /> : t('Test connection')}</button>
                </div>
                {health && (
                  <div className={`alert ${health.ok ? 'success' : 'error'} mt-1`}>
                    {health.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span dir="ltr" style={{ fontSize: 13 }}>{JSON.stringify(health.body)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {cfg.mode === 'proxy' && !cfg.accountRegNo && <div className="alert warn mt-2"><AlertCircle size={18} /> {t('Enter the account registration number before sending live invoices.')}</div>}
        </div>

        <div className="card">
          <h3>{t('How it works')}</h3>
          <ol className="steps-mini">
            <li>{t('Each invoice (manual, Excel or API) is validated and queued.')}</li>
            <li>{t('The background process converts it to a UBL invoice in Qvalia’s JSON (or XML) format.')}</li>
            <li dir="auto">{t('It is sent with POST /transaction/{accountRegNo}/invoices/outgoing and an Idempotency-Key, so retries never create duplicates.')}</li>
            <li>{t('200 → Success with Qvalia’s integration ID. 409 → already accepted. 429 / 5xx → retried up to {max} times. 4xx → failed with Qvalia’s message.', { max: MAX_RETRIES })}</li>
          </ol>
          <h4 className="mt-2">{t('Run the backend proxy')}</h4>
          <pre className="code" dir="ltr">{`# in the project folder
QVALIA_API_KEY=your-key QVALIA_ENV=test npm run proxy
# (Windows PowerShell)
$env:QVALIA_API_KEY="your-key"; npm run proxy`}</pre>
          <p className="muted mb-0" style={{ fontSize: 13 }}>{t('The API key stays on the server. The browser never sees it.')}</p>
        </div>
      </div>
    </>
  );
}
