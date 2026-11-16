// Settings centre (SET-01, SET-02, NTF-01, NTF-02): one place for every value the BRD says is set from the
// settings. Prices, terms, tax data and durations can start on a future date with a second confirmation.
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Save, CheckCircle2, AlertTriangle, CalendarClock, X, Trash2, Database, Plus, Mail, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { getPlatform, setPlatform, scheduleChange, getScheduled, cancelScheduled } from '../../services/platform';
import { getOutbox } from '../../services/messaging';
import { getSettings, saveSettings, MAX_RETRIES } from '../../services/invoices';
import { clearLogs } from '../../services/logs';
import { fmtDate, fmtDateTime } from '../../utils/format';

const GROUPS = [
  ['features', 'Features and channels'], ['durations', 'Durations and deadlines'], ['registration', 'Registration fields'], ['templates', 'Message templates'],
  ['tax', 'Model tax data and numbering'], ['bank', 'Payment and bank account'], ['lists', 'Lists'], ['commission', 'Commission templates'],
  ['obligation', 'Obligation tool'], ['kpi', 'Staff performance'], ['scheduled', 'Scheduled changes'], ['outbox', 'Outbox'], ['demo', 'Demo controls'],
];
const TECH = ['features', 'outbox', 'demo'];

export function SettingsCenter() {
  const { t } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const lv = staffLevel('settings');
  const groups = GROUPS.filter(([k]) => lv === 'full' || TECH.includes(k));
  const [params, setParams] = useSearchParams();
  const g = groups.some(([k]) => k === params.get('g')) ? params.get('g') : groups[0][0];
  return (
    <>
      <PageTitle title="Settings" sub="Every value the business can change without the developers. Prices, terms, tax data and durations can start on a later date." />
      <div className="grid" style={{ gridTemplateColumns: '220px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 8 }}>{groups.map(([k, l]) => <button key={k} className={`chip ${g === k ? 'on' : ''}`} style={{ display: 'block', width: '100%', textAlign: 'start', marginBottom: 4 }} onClick={() => setParams({ g: k })}>{t(l)}</button>)}
          <div className="side-sep" /><Link className="chip" style={{ display: 'block' }} to="/admin/packages">{t('Packages and offers')} →</Link><Link className="chip" style={{ display: 'block', marginTop: 4 }} to="/admin/content">{t('Website content')} →</Link><Link className="chip" style={{ display: 'block', marginTop: 4 }} to="/admin/staff">{t('Roles')} →</Link><Link className="chip" style={{ display: 'block', marginTop: 4 }} to="/admin/integrations">{t('Integrations')} →</Link><Link className="chip" style={{ display: 'block', marginTop: 4 }} to="/admin/tax">{t('Tax & VAT')} →</Link>
        </div>
        <div>
          {g === 'features' && <Features tech={lv !== 'full'} />}
          {g === 'durations' && <Durations />}
          {g === 'registration' && <Registration />}
          {g === 'templates' && <Templates />}
          {g === 'tax' && <ModelTax />}
          {g === 'bank' && <Bank />}
          {g === 'lists' && <Lists />}
          {g === 'commission' && <JsonGroup path="commissionTemplates" title="Commission templates" hint="Templates the manager copies into a partner’s plan. Rates in %." />}
          {g === 'obligation' && <JsonGroup path="obligation" title="Obligation tool" hint="Dates (YYYY-MM-DD) and penalties shown on /check. Model confirms them before launch." />}
          {g === 'kpi' && <JsonGroup path="kpiWeights" title="Staff performance weights" hint="Points for tasks done, deadlines met and no escalations. Total 100." />}
          {g === 'scheduled' && <Scheduled />}
          {g === 'outbox' && <Outbox />}
          {g === 'demo' && <Demo />}
        </div>
      </div>
    </>
  );
}

const SavedNote = ({ on }) => { const { t } = useLang(); return on ? <span className="badge green"><CheckCircle2 size={12} /> {t(on === 'scheduled' ? 'Scheduled' : 'Saved')}</span> : null; };

/** Save now, or schedule for a later date after a second confirmation (SET-02). */
function SaveBar({ path, value, label }) {
  const { t, locale } = useLang();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState('');
  const [err, setErr] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const go = () => {
    try {
      setErr('');
      if (date === today) { setPlatform(path, value); setSaved('now'); } else { scheduleChange({ path, value, effectiveDate: date, label }); setSaved('scheduled'); }
      setConfirm(false);
    } catch (e) { setErr(e); }
  };
  return (
    <div className="mt-2">
      {err && <div className="alert error mb-1">{errText(t, err)}</div>}
      {!confirm ? (
        <div className="flex gap-1 items-center wrap">
          <label className="flex items-center gap-1"><CalendarClock size={15} /> {t('Starts on')} <input className="input input-sm" type="date" dir="ltr" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <button className="btn btn-primary btn-sm" onClick={() => setConfirm(true)}><Save size={14} /> {t('Save')}</button><SavedNote on={saved} />
        </div>
      ) : (
        <div className="alert warn" style={{ alignItems: 'center' }}><AlertTriangle size={16} /><span style={{ flex: 1 }}>{date === today ? t('Apply this change now? The value before and after is logged.') : t('Schedule this change for {date}? It will not apply before that date.', { date: fmtDate(date, locale) })}</span><button className="btn btn-primary btn-sm" onClick={go}>{t('Confirm')}</button><button className="btn btn-outline btn-sm" onClick={() => setConfirm(false)}>{t('Cancel')}</button></div>
      )}
    </div>
  );
}

function Features({ tech }) {
  const { t } = useLang();
  const p = getPlatform();
  const F = [['customerInvoicing', 'Customer invoicing in the platform (phase 2)', 'Off in phase 1: customers issue invoices in the approved billing portal.'], ['partnerProgram', 'Partner programme'], ['customer2fa', 'Two-step sign-in for customers (optional for them)'], ['whatsappButton', 'WhatsApp button on the website'], ['cookieBanner', 'Cookie consent banner'], ['newsTicker', 'News ticker'], ['video', 'Video on the website'], ['ads', 'Advertising spaces']];
  return (
    <div className="card">
      <h3>{t('Features')}</h3>
      {F.map(([k, l, h]) => <div key={k} className="doc-row"><div className="grow"><b>{t(l)}</b>{h && <small>{t(h)}</small>}</div><input type="checkbox" disabled={tech && k !== 'customer2fa'} checked={!!p.features[k]} onChange={(e) => setPlatform(`features.${k}`, e.target.checked)} /></div>)}
      <h3 className="mt-2">{t('Notification channels')}</h3>
      {[['inApp', 'In the platform'], ['email', 'Email'], ['whatsapp', 'WhatsApp Business']].map(([k, l]) => <div key={k} className="doc-row"><div className="grow"><b>{t(l)}</b></div><input type="checkbox" disabled={tech} checked={!!p.channels[k]} onChange={(e) => setPlatform(`channels.${k}`, e.target.checked)} /></div>)}
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('No SMS. Verification codes go by email or WhatsApp. Messages are sent from accounts in Model’s name.')}</p>
    </div>
  );
}

function Durations() {
  const { t } = useLang();
  const p = getPlatform();
  const [d, setD] = useState(p.durations);
  const [w, setW] = useState(p.workHours);
  const L = { freeDocs: 'Free documents per subscription year', graceDays: 'Grace days after a failed renewal', refundDays: 'Full refund window (days)', refundPayoutBusinessDays: 'Refund paid back within (working days)', referralDays: 'Referral link valid (days)', commissionHoldDays: 'Commission held (days)', archiveDays: 'Archive after disconnection (days)', csFirstContactHours: 'First contact with a new customer (working hours)', leadFirstContactDays: 'First contact with a lead (working days)', usageSyncMinutes: 'Usage reading every (minutes)', renewalReminderDays: 'Renewal reminder (days before)' };
  return (
    <>
      <div className="card">
        <h3>{t('Durations and deadlines')}</h3>
        <div className="form-grid">{Object.keys(L).map((k) => <div className="field" key={k}><label>{t(L[k])}</label><input className="input" type="number" dir="ltr" value={d[k]} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })} /></div>)}</div>
        <SaveBar path="durations" value={d} label="Durations" />
      </div>
      <div className="card mt-2">
        <h3>{t('Working hours (deadlines and escalation)')}</h3>
        <div className="form-grid">
          <div className="field"><label>{t('Start hour')}</label><input className="input" type="number" dir="ltr" value={w.start} onChange={(e) => setW({ ...w, start: Number(e.target.value) })} /></div>
          <div className="field"><label>{t('End hour')}</label><input className="input" type="number" dir="ltr" value={w.end} onChange={(e) => setW({ ...w, end: Number(e.target.value) })} /></div>
          <div className="field full"><label>{t('Working days')}</label><div className="chip-group">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => <button key={n} type="button" className={`chip ${w.days.includes(i) ? 'on' : ''}`} onClick={() => setW({ ...w, days: w.days.includes(i) ? w.days.filter((x) => x !== i) : [...w.days, i].sort() })}>{t(n)}</button>)}</div></div>
        </div>
        <SaveBar path="workHours" value={w} label="Working hours" />
      </div>
    </>
  );
}

function TextList({ label, value, onChange }) {
  const { t } = useLang();
  return <div className="field full"><label>{t(label)}</label><textarea className="input" rows="4" value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} /><span className="hint">{t('One per line.')}</span></div>;
}

function Registration() {
  const { t } = useLang();
  const [r, setR] = useState(getPlatform().registration);
  return (
    <div className="card">
      <h3>{t('Registration fields and activities')}</h3>
      <label className="checkbox mb-2"><input type="checkbox" checked={r.blockFreeEmail} onChange={(e) => setR({ ...r, blockFreeEmail: e.target.checked })} /> {t('Require a company email (block personal email domains)')}</label>
      <div className="form-grid">
        <TextList label="Personal email domains" value={r.freeEmailDomains} onChange={(v) => setR({ ...r, freeEmailDomains: v })} />
        <TextList label="Business activities" value={r.activities} onChange={(v) => setR({ ...r, activities: v })} />
        <TextList label="Licence issuing authorities" value={r.licenceIssuers} onChange={(v) => setR({ ...r, licenceIssuers: v })} />
        <TextList label="Sending methods" value={r.sendingMethods} onChange={(v) => setR({ ...r, sendingMethods: v })} />
      </div>
      <h4 className="mt-2">{t('Required documents')}</h4>
      {r.requiredDocs.map((d, i) => <div key={d.id} className="flex gap-1 mb-1 items-center"><input className="input input-sm" value={d.label} onChange={(e) => setR({ ...r, requiredDocs: r.requiredDocs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /><label className="checkbox"><input type="checkbox" checked={d.required} onChange={(e) => setR({ ...r, requiredDocs: r.requiredDocs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} /> {t('Required')}</label></div>)}
      <button className="btn btn-outline btn-sm" onClick={() => setR({ ...r, requiredDocs: [...r.requiredDocs, { id: `doc${Date.now().toString(36)}`, label: 'New document', required: false }] })}><Plus size={14} /> {t('Add document')}</button>
      <SaveBar path="registration" value={r} label="Registration fields" />
    </div>
  );
}

function Templates() {
  const { t } = useLang();
  const [tp, setTp] = useState(getPlatform().templates);
  return (
    <div className="card">
      <h3>{t('Message templates')}</h3>
      <p className="muted" style={{ fontSize: 13 }}>{t('Bilingual text for every event. {placeholders} are filled in automatically. Sent in the platform, by email and by WhatsApp Business.')}</p>
      {Object.entries(tp).map(([k, v]) => (
        <div key={k} className="card-soft mb-2"><b>{t(v.name)}</b>
          <div className="form-grid mt-1"><div className="field"><label><Mail size={12} /> {t('English')}</label><textarea className="input" rows="3" value={v.en} onChange={(e) => setTp({ ...tp, [k]: { ...v, en: e.target.value } })} /></div><div className="field"><label><MessageCircle size={12} /> {t('Arabic')}</label><textarea className="input" dir="rtl" rows="3" value={v.ar} onChange={(e) => setTp({ ...tp, [k]: { ...v, ar: e.target.value } })} /></div></div>
        </div>
      ))}
      <SaveBar path="templates" value={tp} label="Templates" />
    </div>
  );
}

function ModelTax() {
  const { t } = useLang();
  const [m, setM] = useState(getPlatform().modelTax);
  const L = { legalName: 'Legal name', legalNameAr: 'Legal name (Arabic)', licence: 'Licence', trn: 'TRN', address: 'Address', addressAr: 'Address (Arabic)', peppolId: 'Model’s Peppol ID', invoicePrefix: 'Invoice series prefix', creditPrefix: 'Credit note series prefix', email: 'Billing email' };
  return (
    <div className="card">
      <h3>{t('Model tax data and numbering')}</h3>
      <div className="form-grid">{Object.keys(L).map((k) => <div className="field" key={k}><label>{t(L[k])}</label><input className="input" dir={k.endsWith('Ar') ? 'rtl' : ['trn', 'peppolId', 'invoicePrefix', 'creditPrefix', 'email', 'licence'].includes(k) ? 'ltr' : undefined} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></div>)}</div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Numbers run without gaps within each series and year. Changing a prefix starts it on the chosen date.')}</p>
      <SaveBar path="modelTax" value={m} label="Model tax data" />
    </div>
  );
}

function Bank() {
  const { t } = useLang();
  const p = getPlatform();
  const [b, setB] = useState(p.bank);
  const [s, setS] = useState(p.sso);
  return (
    <>
      <div className="card">
        <h3>{t('Bank account for transfers')}</h3>
        <div className="form-grid">{[['bankName', 'Bank'], ['accountName', 'Account name'], ['iban', 'IBAN'], ['swift', 'SWIFT']].map(([k, l]) => <div className="field" key={k}><label>{t(l)}</label><input className="input" dir={['iban', 'swift'].includes(k) ? 'ltr' : undefined} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} /></div>)}</div>
        <p className="muted mt-1" style={{ fontSize: 12.5 }}>{t('Card payments go through the payment gateway with no extra fee. Card data is never stored on the platform.')}</p>
        <SaveBar path="bank" value={b} label="Bank account" />
      </div>
      <div className="card mt-2">
        <h3>{t('Billing portal (single sign-on)')}</h3>
        <div className="field"><label>{t('Portal address')}</label><input className="input" dir="ltr" value={s.portalUrl} onChange={(e) => setS({ ...s, portalUrl: e.target.value })} /></div>
        <SaveBar path="sso" value={s} label="Billing portal" />
      </div>
    </>
  );
}

function Lists() {
  const { t } = useLang();
  const p = getPlatform();
  const [loss, setLoss] = useState(p.lossReasons);
  const [types, setTypes] = useState(p.partnerTypes);
  const [cons, setCons] = useState(p.consulting);
  return (
    <>
      <div className="card"><h3>{t('Lead loss reasons')}</h3><TextList label="Reasons" value={loss} onChange={setLoss} /><SaveBar path="lossReasons" value={loss} label="Loss reasons" /></div>
      <div className="card mt-2"><h3>{t('Partner types')}</h3><TextList label="Types" value={types} onChange={setTypes} /><SaveBar path="partnerTypes" value={types} label="Partner types" /></div>
      <div className="card mt-2"><h3>{t('Consulting services')}</h3>
        {cons.map((c, i) => <div key={c.id} className="flex gap-1 mb-1"><input className="input input-sm" value={c.name} onChange={(e) => setCons(cons.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /><input className="input input-sm" type="number" dir="ltr" style={{ maxWidth: 90 }} value={c.hours} onChange={(e) => setCons(cons.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))} title={t('Hours')} /><input className="input input-sm" type="number" dir="ltr" style={{ maxWidth: 110 }} value={c.price} onChange={(e) => setCons(cons.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} title={t('Price')} /><button className="icon-btn danger" onClick={() => setCons(cons.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>)}
        <button className="btn btn-outline btn-sm" onClick={() => setCons([...cons, { id: `cs-${Date.now().toString(36)}`, name: 'New service', hours: 1, price: 500 }])}><Plus size={14} /> {t('Add')}</button>
        <SaveBar path="consulting" value={cons} label="Consulting services" />
      </div>
    </>
  );
}

function JsonGroup({ path, title, hint }) {
  const { t } = useLang();
  const get = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
  const [text, setText] = useState(JSON.stringify(get(getPlatform(), path), null, 2));
  let value = null; let bad = false;
  try { value = JSON.parse(text); } catch { bad = true; }
  return (
    <div className="card">
      <h3>{t(title)}</h3>
      <p className="muted" style={{ fontSize: 13 }}>{t(hint)}</p>
      <textarea className="input" dir="ltr" rows="16" style={{ fontFamily: 'monospace', fontSize: 13 }} value={text} onChange={(e) => setText(e.target.value)} />
      {bad ? <div className="alert error mt-1">{t('The text is not valid.')}</div> : <SaveBar path={path} value={value} label={title} />}
    </div>
  );
}

function Scheduled() {
  const { t, locale } = useLang();
  const list = getScheduled();
  return (
    <div className="card">
      <h3>{t('Scheduled changes')}</h3>
      <div className="table-wrap"><table><thead><tr><th>{t('Change')}</th><th>{t('Starts on')}</th><th>{t('Status')}</th><th>{t('Created')}</th><th /></tr></thead>
        <tbody>{list.map((x) => <tr key={x.id}><td><b>{t(x.label)}</b><small className="muted" style={{ display: 'block' }} dir="ltr">{x.path}</small></td><td>{fmtDate(x.effectiveDate, locale)}</td><td><span className={`badge ${x.status === 'Applied' ? 'green' : x.status === 'Cancelled' ? 'gray' : 'orange'}`}>{t(x.status)}</span></td><td>{fmtDateTime(x.createdAt, locale)}</td><td>{x.status === 'Scheduled' && <button className="btn btn-outline btn-sm" onClick={() => cancelScheduled(x.id)}><X size={14} /> {t('Cancel')}</button>}</td></tr>)}
          {!list.length && <tr><td colSpan="5" className="muted center" style={{ padding: 20 }}>{t('Nothing scheduled.')}</td></tr>}</tbody></table></div>
    </div>
  );
}

function Outbox() {
  const { t, locale, lang } = useLang();
  const list = getOutbox();
  return (
    <div className="card">
      <h3>{t('Outbox')}</h3>
      <p className="muted" style={{ fontSize: 13 }}>{t('Demo: messages that would be sent by email and WhatsApp Business.')}</p>
      <div className="table-wrap"><table><thead><tr><th>{t('Time')}</th><th>{t('To')}</th><th>{t('Template')}</th><th>{t('Channels')}</th><th>{t('Text')}</th></tr></thead>
        <tbody>{list.slice(0, 100).map((m) => <tr key={m.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.at, locale)}</td><td>{m.to.name}<small className="muted" style={{ display: 'block' }} dir="ltr">{m.to.email || m.to.phone}</small></td><td>{t(m.templateName)}</td><td>{m.channels.map((c) => t(c)).join(', ')}</td><td style={{ fontSize: 13 }} dir="auto">{lang === 'ar' ? m.text.ar : m.text.en}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function Demo() {
  const { t } = useLang();
  const s = getSettings();
  const resetDemo = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('mei_') && k !== 'mei_lang').forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.href = '/login';
  };
  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>{t('Background processing (phase 2 invoicing)')}</h3>
        <div className="field mt-2"><label>{t('Access point success rate: {n}%', { n: Math.round(s.successRate * 100) })}</label><input type="range" min="0" max="100" step="5" value={Math.round(s.successRate * 100)} onChange={(e) => saveSettings({ successRate: Number(e.target.value) / 100 })} /></div>
        <div className="field mt-2"><label>{t('Step duration: {n} s', { n: (s.phaseMs / 1000).toFixed(1) })}</label><input type="range" min="500" max="6000" step="500" value={s.phaseMs} onChange={(e) => saveSettings({ phaseMs: Number(e.target.value) })} /></div>
        <div className="field mt-2"><label>{t('Retry delay: {n} s', { n: (s.retryMs / 1000).toFixed(0) })}</label><input type="range" min="1000" max="20000" step="1000" value={s.retryMs} onChange={(e) => saveSettings({ retryMs: Number(e.target.value) })} /><span className="hint">{t('Production: retry every 5–10 minutes, max {max} attempts.', { max: MAX_RETRIES })}</span></div>
      </div>
      <div className="card">
        <h3>{t('Demo data')}</h3>
        <p>{t('Clear logs or reset everything back to the original demo data.')}</p>
        <div className="flex gap-1 wrap mt-2"><button className="btn btn-outline btn-sm" onClick={clearLogs}><Trash2 size={15} /> {t('Clear logs')}</button><button className="btn btn-danger btn-sm" onClick={resetDemo}><Database size={15} /> {t('Reset demo data')}</button></div>
      </div>
    </div>
  );
}
