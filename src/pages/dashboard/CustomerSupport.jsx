import { useState } from 'react';
import { Plus, Send, X, LifeBuoy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { getTickets, createTicket, replyTicket, TICKET_CATEGORIES, TICKET_PRIORITIES } from '../../services/support';
import { fmtDateTime, timeAgo } from '../../utils/format';

const STATUS_CLS = { Open: 'orange', 'In progress': 'blue', 'Waiting for customer': 'purple', Resolved: 'green' };

/** Customer side of support: open a ticket and follow the conversation with the MEI team. */
export default function CustomerSupport() {
  const { user, me } = useAuth();
  const { t, locale } = useLang();
  useDbVersion();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ subject: '', category: 'Technical', priority: 'Normal', message: '' });
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState(null);
  const mine = getTickets().filter((x) => x.userId === user.id);
  const tk = mine.find((x) => x.id === openId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault(); setError(null);
    try {
      const n = createTicket({ ...f, userId: user.id, company: user.company?.name || '', name: me.name, email: me.email });
      setCreating(false); setF({ subject: '', category: 'Technical', priority: 'Normal', message: '' }); setOpenId(n.id);
    } catch (err) { setError(err); }
  };
  const send = () => { setError(null); try { replyTicket(tk.id, { from: 'customer', name: me.name, text: reply }); setReply(''); } catch (err) { setError(err); } };

  return (
    <div className="card">
      <div className="card-head">
        <div><h3>{t('Support')}</h3><small>{t('Ask the MEI team for help. You get a notification when they reply.')}</small></div>
        {!creating && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={16} /> {t('New ticket')}</button>}
      </div>

      {creating && (
        <form className="card-soft mb-2" onSubmit={submit}>
          <div className="form-grid">
            <div className="field full"><label>{t('Subject *')}</label><input className="input" autoFocus value={f.subject} onChange={set('subject')} maxLength={120} /></div>
            <div className="field"><label>{t('Category')}</label><select className="input" value={f.category} onChange={set('category')}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></div>
            <div className="field"><label>{t('Priority')}</label><select className="input" value={f.priority} onChange={set('priority')}>{TICKET_PRIORITIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></div>
            <div className="field full"><label>{t('Describe the problem *')}</label><textarea className="input" rows="4" value={f.message} onChange={set('message')} placeholder={t('Invoice number, what you did, and what happened.')} /></div>
          </div>
          {error && <div className="alert error mb-1">{errText(t, error)}</div>}
          <div className="flex gap-1">
            <button className="btn btn-primary btn-sm" type="submit"><Send size={15} /> {t('Send ticket')}</button>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setCreating(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table className="table-click">
          <thead><tr><th>{t('Ticket')}</th><th>{t('Subject')}</th><th>{t('Category')}</th><th>{t('Status')}</th><th>{t('Updated')}</th></tr></thead>
          <tbody>
            {mine.map((x) => (
              <tr key={x.id} onClick={() => setOpenId(x.id)}>
                <td dir="ltr" className="muted">{x.id}</td><td><strong>{x.subject}</strong><div className="muted" style={{ fontSize: 12 }}>{x.name}</div></td><td>{t(x.category)}</td>
                <td><span className={`badge ${STATUS_CLS[x.status] || 'gray'}`}>{t(`${x.status}|status`)}</span></td><td className="muted">{timeAgo(x.updatedAt || x.createdAt, t)}</td>
              </tr>
            ))}
            {!mine.length && <tr><td colSpan="5" className="center muted" style={{ padding: 28 }}><LifeBuoy size={18} style={{ verticalAlign: 'middle' }} /> {t('No tickets yet.')}</td></tr>}
          </tbody>
        </table>
      </div>

      {tk && (
        <div className="drawer-backdrop" onClick={() => setOpenId(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div><span className="muted" dir="ltr" style={{ fontSize: 13 }}>{tk.id}</span><h3 className="mb-0">{tk.subject}</h3></div>
              <div className="flex items-center gap-1"><span className={`badge ${STATUS_CLS[tk.status] || 'gray'}`}>{t(`${tk.status}|status`)}</span><button className="ab-close" onClick={() => setOpenId(null)} aria-label={t('Close')}><X size={18} /></button></div>
            </div>
            <div className="ticket-msgs">
              {tk.messages.map((m, i) => (
                <div key={i} className={`ticket-msg ${m.from}`}><small>{m.from === 'support' ? t('MEI Support') : m.name} · {fmtDateTime(m.at, locale)}</small><p dir="auto">{m.text}</p></div>
              ))}
            </div>
            {tk.status !== 'Resolved' ? (
              <>
                <div className="field"><label>{t('Reply')}</label><textarea className="input" rows="3" value={reply} onChange={(e) => setReply(e.target.value)} /></div>
                {error && <div className="alert error mt-1">{errText(t, error)}</div>}
                <button className="btn btn-primary btn-sm mt-1" disabled={!reply.trim()} onClick={send}><Send size={15} /> {t('Send')}</button>
              </>
            ) : <p className="muted">{t('This ticket is resolved. Open a new ticket if you need more help.')}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
