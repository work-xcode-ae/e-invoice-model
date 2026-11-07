import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { liveAlerts, invoicesLeft } from '../services/notifications';
import { useAlertAction, ACTION_LABEL } from '../hooks/useAlertAction';
import { msg } from '../utils/format';

const ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info };

/** Most urgent live alert(s) at the top of the dashboard: invoices left, renewal, lock… */
export default function AlertBanner() {
  const { user, can } = useAuth();
  const { t, locale } = useLang();
  const act = useAlertAction();
  const BILLING = ['renew', 'addon', 'packages', 'plan'];
  const allowed = (action) => action && (!BILLING.includes(action) || can('billing')) && (action !== 'company' || can('company'));
  const [hidden, setHidden] = useState([]);
  if (!user) return null;
  const alerts = liveAlerts(user).filter((a) => (a.level === 'danger' || a.level === 'warning' || a.id === 'locked') && !hidden.includes(a.id)).slice(0, 2);
  if (!alerts.length) return null;
  return (
    <div className="alert-stack">
      {alerts.map((a) => {
        const Icon = ICON[a.level] || Info;
        return (
          <div key={a.id} className={`alert-banner lvl-${a.level}`} role="status">
            <Icon size={20} />
            <span className="ab-text">{msg(t, a, locale)}</span>
            <div className="ab-actions">
              {a.action && BILLING.includes(a.action) && !can('billing') && <span className="ab-owner">{t('Ask the account owner to renew or buy more.')}</span>}
              {a.action === 'addon' && allowed('renew') && <button className="btn btn-sm btn-outline" onClick={() => act('renew')}>{t('Renew now')}</button>}
              {allowed(a.action) && <button className={`btn btn-sm ${a.level === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => act(a.action)}>{t(ACTION_LABEL[a.action])}</button>}
              {a.id !== 'locked' && <button className="ab-close" onClick={() => setHidden((h) => [...h, a.id])} aria-label={t('Dismiss')}><X size={16} /></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact "invoices left" meter used in the dashboard header. */
export function InvoicesLeftPill() {
  const { user } = useAuth();
  const { t } = useLang();
  const s = user?.subscription;
  if (!s || s.locked) return null;
  const left = invoicesLeft(user);
  const pct = s.transactionsLimit ? left / s.transactionsLimit : 0;
  const lvl = left === 0 || pct <= 0.1 ? 'danger' : pct <= 0.2 ? 'warning' : 'ok';
  return (
    <div className={`left-pill lvl-${lvl}`} title={t('Invoices left in your package')}>
      <span className="lp-bar"><i style={{ width: `${Math.max(3, pct * 100)}%` }} /></span>
      <span><b dir="ltr">{left.toLocaleString()}</b> {t('invoices left')}</span>
    </div>
  );
}
