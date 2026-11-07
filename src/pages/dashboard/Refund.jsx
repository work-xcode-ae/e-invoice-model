import { useState } from 'react';
import { RotateCcw, Paperclip, Loader2, AlertCircle, Lock, XCircle, Ban, Code2, PackageX, Eye, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { requestRefund, activeRefund, REFUND_REASONS } from '../../services/refunds';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime, STATUS_BADGE } from '../../utils/format';

const STEPS = ['Pending', 'Approved', 'Refunded'];

function RefundTracker({ r }) {
  const { t, locale } = useLang();
  const reached = (st) => r.history.some((h) => h.status === st) || (st === 'Approved' && r.status === 'Processing');
  return (
    <div className="refund-card">
      <div className="flex between items-center wrap gap-1">
        <div>
          <strong dir="ltr">{r.id}</strong> <span className={`badge ${STATUS_BADGE[r.status] || 'blue'}`}>{t(r.status)}</span>
          <div className="muted" style={{ fontSize: 13 }}>{t('Requested {date}', { date: fmtDate(r.requestedAt, locale) })} · {formatMoney(r.amount)} · {t(r.packageName)}</div>
        </div>
      </div>
      {r.status !== 'Rejected' ? (
        <div className="stepper">
          {STEPS.map((st, i) => (
            <div key={st} className={`st ${reached(st) ? 'done' : ''} ${r.status === 'Processing' && st === 'Refunded' ? 'current' : ''}`}>
              <span className="st-dot">{reached(st) ? <CheckCircle2 size={14} /> : r.status === 'Processing' && st === 'Refunded' ? <Loader2 size={14} className="spin" /> : i + 1}</span>
              <span>{t(st === 'Pending' ? 'Request received' : st === 'Approved' ? 'Approved' : 'Refunded via Stripe')}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="alert error mt-1"><XCircle size={18} /> {t('Rejected: {note}', { note: r.decisionNote })}</div>
      )}
      <ul className="tl-mini">
        {r.history.map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · <b>{t(h.status)}</b>{h.note ? ` · ${t(h.note, h.vars)}` : ''}</li>)}
      </ul>
    </div>
  );
}

export function LockedNotice() {
  const { t } = useLang();
  const items = [
    [Ban, 'Cannot create new invoices'],
    [Code2, 'API / SDK access is disabled'],
    [PackageX, 'Cannot purchase add-ons or renew'],
    [Lock, 'Remaining transactions cannot be used'],
    [Eye, 'History stays available (read-only)'],
  ];
  return (
    <div className="card locked-card">
      <h3 className="flex items-center gap-1"><Lock size={20} /> {t('Package locked')}</h3>
      <p>{t('Due to the refund, your package is locked and cannot be used.')}</p>
      <ul className="req-list mt-1">
        {items.map(([Icon, txt]) => <li key={txt}><Icon size={16} /> {t(txt)}</li>)}
      </ul>
    </div>
  );
}

export default function RefundSection() {
  const { user } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reason: '', comments: '', attachments: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const refunds = user.refunds || [];
  const pending = activeRefund(user);
  const canRequest = user.subscription && !user.subscription.locked && !pending;

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await requestRefund(user, form);
      setOpen(false); setForm({ reason: '', comments: '', attachments: [] });
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="card mt-3">
      <div className="flex between items-center wrap gap-1 mb-1">
        <div>
          <h3 className="mb-0">{t('Refunds')}</h3>
          <p className="muted mb-0" style={{ fontSize: 14 }}>{t('Request a refund for your current package. An administrator reviews every request.')}</p>
        </div>
        {canRequest && !open && <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}><RotateCcw size={15} /> {t('Request refund')}</button>}
      </div>

      {open && (
        <form className="edit-panel" onSubmit={submit} noValidate>
          <div className="alert warn mb-2"><AlertCircle size={18} /> {t('If the refund is approved, your package will be locked: new invoices, API access, renewals and add-ons will be disabled. Invoices already sent stay in your history.')}</div>
          <div className="form-grid">
            <div className="field full">
              <label>{t('Reason for refund *')}</label>
              <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                <option value="">{t('Choose a reason')}</option>
                {REFUND_REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
            </div>
            <div className="field full">
              <label>{t('Comments (optional)')}</label>
              <textarea className="input" style={{ minHeight: 80 }} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
            </div>
            <div className="field full">
              <label>{t('Supporting files (if needed)')}</label>
              <label className="file-pick">
                <Paperclip size={16} /> {t('Attach files')}
                <input type="file" multiple hidden onChange={(e) => setForm({ ...form, attachments: [...form.attachments, ...[...e.target.files].map((f) => f.name)] })} />
              </label>
              {form.attachments.length > 0 && <div className="rp-list mt-1">{form.attachments.map((n) => <span key={n} className="chip-mini" dir="ltr">{n}</span>)}</div>}
            </div>
          </div>
          {error && <div className="alert error mt-2"><AlertCircle size={18} /> {errText(t, error)}</div>}
          <div className="flex gap-1 mt-2">
            <button className="btn btn-danger btn-sm" disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />} {t('Submit refund request')}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      {pending && <div className="alert info mb-1"><Clock size={18} /> {t('Your refund request is being reviewed. We will notify you of the decision.')}</div>}
      {refunds.length === 0 && !open && <p className="muted mb-0" style={{ fontSize: 14 }}>{t('No refund requests.')}</p>}
      {refunds.map((r) => <RefundTracker key={r.id} r={r} />)}
    </div>
  );
}
