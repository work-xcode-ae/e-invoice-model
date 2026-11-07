import { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, AlertCircle, Info, CheckCircle2, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { liveAlerts, markAllRead } from '../services/notifications';
import { useAlertAction, ACTION_LABEL } from '../hooks/useAlertAction';
import { msg, timeAgo } from '../utils/format';

const ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info, success: CheckCircle2 };

export default function NotificationBell() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const act = useAlertAction();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!user || user.role === 'SuperAdmin') return null;
  const alerts = liveAlerts(user).filter((a) => a.level !== 'info' || a.id === 'no-plan' || a.id === 'pending');
  const notes = user.notifications || [];
  const unread = notes.filter((n) => !n.read).length;
  const count = alerts.filter((a) => a.level === 'danger' || a.level === 'warning').length + unread;

  const go = (action) => { setOpen(false); act(action); };

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="icon-btn bell-btn" onClick={() => { setOpen((o) => !o); }} aria-label={t('Notifications')} aria-expanded={open}>
        <Bell size={19} />
        {count > 0 && <span className="count">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="bell-dd" role="dialog" aria-label={t('Notifications')}>
          <div className="bell-head">
            <strong>{t('Notifications')}</strong>
            {unread > 0 && <button className="link-btn" onClick={() => markAllRead(user.id)}><CheckCheck size={14} /> {t('Mark all as read')}</button>}
          </div>
          <div className="bell-body">
            {alerts.length > 0 && <div className="bell-section">{t('Needs attention')}</div>}
            {alerts.map((a) => {
              const Icon = ICON[a.level];
              return (
                <div key={a.id} className={`bell-item lvl-${a.level}`}>
                  <span className="bell-ic"><Icon size={16} /></span>
                  <div>
                    <p>{msg(t, a, locale)}</p>
                    {a.action && <button className="link-btn" onClick={() => go(a.action)}>{t(ACTION_LABEL[a.action])} →</button>}
                  </div>
                </div>
              );
            })}
            <div className="bell-section">{t('Recent')}</div>
            {notes.length === 0 && <p className="bell-empty">{t('No notifications yet.')}</p>}
            {notes.slice(0, 12).map((n) => {
              const Icon = ICON[n.level] || Info;
              return (
                <div key={n.id} className={`bell-item lvl-${n.level} ${n.read ? '' : 'unread'}`}>
                  <span className="bell-ic"><Icon size={16} /></span>
                  <div>
                    <p>{msg(t, n, locale)}</p>
                    <small>{timeAgo(n.at, t)}</small>
                    {n.link && <button className="link-btn" onClick={() => go(n.link)}>{t(ACTION_LABEL[n.link] || 'Open')} →</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
