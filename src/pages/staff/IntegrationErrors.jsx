// IT view (INT-01, INT-04): every integration failure with its log and task; usage reading controls.
import { useState } from 'react';
import { CheckCircle2, RefreshCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { getIntegrationErrors, resolveIntegrationError, syncAllUsage, syncUsage } from '../../services/integration';
import { allDocsWithCompany, sendEInvoice } from '../../services/modelDocs';
import { getUsers } from '../../services/api';
import { fmtDateTime } from '../../utils/format';

export default function IntegrationErrors() {
  const { t, locale } = useLang();
  useDbVersion();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const errors = getIntegrationErrors();
  const rejected = allDocsWithCompany().filter((d) => d.einvoice?.status === 'Rejected');
  const active = getUsers().filter((u) => u.subscription?.ledger);
  const simulate = async () => { setBusy('f'); setErr(''); try { await syncUsage(active[0]?.id, { manual: true, fail: true }); } catch (e) { setErr(e); } finally { setBusy(''); } };
  return (
    <div className="grid" style={{ gap: 16, marginTop: 16 }}>
      <div className="card">
        <div className="flex between items-center wrap gap-1 mb-2">
          <h3 className="mb-0">{t('Usage readings from the technical partner')}</h3>
          <div className="flex gap-1"><button className="btn btn-outline btn-sm" onClick={() => syncAllUsage()}><RefreshCcw size={14} /> {t('Read all now')}</button><button className="btn btn-outline btn-sm" disabled={busy === 'f'} onClick={simulate}>{busy === 'f' ? <Loader2 size={14} className="spin" /> : <AlertTriangle size={14} />} {t('Simulate a failed reading')}</button></div>
        </div>
        {err && <div className="alert warn mb-2">{errText(t, err)}</div>}
        <p className="muted mb-0" style={{ fontSize: 13 }}>{t('{n} active customers are read every hour. Customers can also press “Refresh now”.', { n: active.length })}</p>
      </div>
      <div className="card">
        <h3>{t('Model e-invoices rejected')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Document')}</th><th>{t('Customer')}</th><th>{t('Error')}</th><th /></tr></thead>
          <tbody>{rejected.map((d) => <tr key={d.id}><td dir="ltr">{d.id}</td><td>{d.company}</td><td className="muted">{d.einvoice.error}</td><td><button className="btn btn-outline btn-sm" onClick={() => sendEInvoice(d.id)}><RefreshCcw size={14} /> {t('Resend')}</button></td></tr>)}
            {!rejected.length && <tr><td colSpan="4" className="muted center">{t('None.')}</td></tr>}</tbody></table></div>
        <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Model’s own e-invoices are never counted in the customer’s documents.')}</p>
      </div>
      <div className="card">
        <h3>{t('Integration errors')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Time')}</th><th>{t('System')}</th><th>{t('Operation')}</th><th>{t('Error')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>{errors.map((e) => <tr key={e.id}><td className="muted">{fmtDateTime(e.at, locale)}</td><td>{t(e.system)}</td><td>{t(e.operation)}</td><td dir="ltr" style={{ fontSize: 12.5 }}>{e.error}</td><td><span className={`badge ${e.status === 'Open' ? 'red' : 'green'}`}>{t(e.status)}</span></td><td>{e.status === 'Open' && <button className="btn btn-outline btn-sm" onClick={() => resolveIntegrationError(e.id)}><CheckCircle2 size={14} /> {t('Resolved')}</button>}</td></tr>)}
            {!errors.length && <tr><td colSpan="6" className="muted center">{t('No errors. Every failure appears here and opens a task for IT.')}</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
