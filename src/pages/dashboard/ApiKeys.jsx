// API keys for ERP systems (CUS-05): created by a Manager only, shown once, revocable.
import { useState } from 'react';
import { KeyRound, Copy, Trash2, Plus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { updateUser } from '../../services/api';
import { addAudit } from '../../services/audit';
import { fmtDate, fmtDateTime } from '../../utils/format';

const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, '0')).join('');

export default function ApiKeys({ user }) {
  const { t, locale } = useLang();
  const { can, me } = useAuth();
  const [name, setName] = useState('');
  const [shown, setShown] = useState(null);
  const [copied, setCopied] = useState(false);
  // Older demo data kept one plain key: show it as a legacy key with its prefix only.
  const keys = [...(user.apiKeys || []), ...(user.apiKey && !(user.apiKeys || []).length ? [{ id: 'legacy', name: 'Default', prefix: user.apiKey.slice(0, 12), createdAt: user.createdAt, lastUsedAt: null }] : [])];

  const create = () => {
    const secret = `mei_live_${rand(16)}`;
    const k = { id: `key_${rand(4)}`, name: name.trim() || 'ERP', prefix: secret.slice(0, 12), hash: `sha256:${rand(16)}`, createdAt: new Date().toISOString(), createdBy: me?.name, lastUsedAt: null, revokedAt: null };
    updateUser(user.id, (u) => ({ apiKeys: [...(u.apiKeys || []), k] }));
    addAudit({ area: 'Customers', action: 'API key created', entity: `${user.company?.name} · ${k.prefix}…`, before: null, after: { name: k.name } });
    setShown(secret); setName(''); setCopied(false);
  };
  const revoke = (id) => {
    updateUser(user.id, (u) => ({ apiKeys: (u.apiKeys || []).map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)), ...(id === 'legacy' ? { apiKey: null } : {}) }));
    addAudit({ area: 'Customers', action: 'API key revoked', entity: `${user.company?.name} · ${id}`, before: 'active', after: 'revoked' });
  };

  return (
    <div className="card">
      <h3><KeyRound size={18} /> {t('API keys for your ERP')}</h3>
      <p className="muted" style={{ fontSize: 14 }}>{t('Use a key to connect your ERP. The full key is shown only once, when you create it. Only managers can create or revoke keys.')}</p>
      {shown && (
        <div className="alert success mb-2" style={{ alignItems: 'flex-start' }}>
          <CheckCircle2 size={18} />
          <div style={{ flex: 1 }}>
            <b>{t('Copy your key now. You will not see it again.')}</b>
            <div className="flex gap-1 items-center mt-1"><code dir="ltr" style={{ wordBreak: 'break-all' }}>{shown}</code><button className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(shown); setCopied(true); }}><Copy size={14} /> {t(copied ? 'Copied' : 'Copy')}</button></div>
          </div>
          <button className="ab-close" onClick={() => setShown(null)} aria-label={t('Close')}>×</button>
        </div>
      )}
      {can('api') ? (
        <div className="flex gap-1 mb-2"><input className="input" style={{ maxWidth: 260 }} placeholder={t('Key name, e.g. SAP production')} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary btn-sm" onClick={create}><Plus size={15} /> {t('Create key')}</button></div>
      ) : <div className="alert info mb-2"><AlertTriangle size={16} /> {t('Only a manager can create or revoke keys.')}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Name')}</th><th>{t('Key')}</th><th>{t('Created')}</th><th>{t('Last used')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className={k.revokedAt ? 'row-muted' : ''}>
                <td><b>{k.name}</b>{k.createdBy && <small className="muted" style={{ display: 'block' }}>{k.createdBy}</small>}</td>
                <td dir="ltr"><code>{k.prefix}…</code></td>
                <td>{fmtDate(k.createdAt, locale)}</td>
                <td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt, locale) : '—'}</td>
                <td><span className={`badge ${k.revokedAt ? 'gray' : 'green'}`}>{t(k.revokedAt ? 'Revoked' : 'Active')}</span></td>
                <td>{!k.revokedAt && can('api') && <button className="btn btn-outline btn-sm" onClick={() => revoke(k.id)}><Trash2 size={14} /> {t('Revoke')}</button>}</td>
              </tr>
            ))}
            {!keys.length && <tr><td colSpan="6" className="muted center" style={{ padding: 20 }}>{t('No keys yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
