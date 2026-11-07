import { useMemo, useState } from 'react';
import { Copy, Download, FileJson, FileCode2, Send, Inbox } from 'lucide-react';
import { useLang } from '../../i18n/LanguageContext';
import { getUserById } from '../../services/api';
import { list } from '../../services/masterData';
import { toQvaliaJson, toUblXml, requestInfo, getQvaliaConfig, sellerSnapshot, buyerSnapshot } from '../../services/qvalia';
import { PROFILES } from '../../data/ubl';

/** Rebuilds the exact payload for an invoice (uses the party snapshots stored at creation). */
function withParties(inv, userId) {
  if (inv.seller && inv.buyer) return inv;
  const u = getUserById(userId) || {};
  const customer = list(u, 'customers').find((c) => c.id === inv.customerId) || { name: inv.customerName, trn: inv.customerTrn, country: 'AE' };
  return { ...inv, seller: inv.seller || sellerSnapshot(u), buyer: inv.buyer || buyerSnapshot(customer) };
}

export default function QvaliaPayload({ inv, userId }) {
  const { t } = useLang();
  const cfg = getQvaliaConfig();
  const [view, setView] = useState(cfg.format === 'xml' ? 'xml' : 'json');
  const [copied, setCopied] = useState(false);
  const full = useMemo(() => withParties(inv, userId), [inv, userId]);
  const json = useMemo(() => JSON.stringify(toQvaliaJson(full, cfg), null, 2), [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const xml = useMemo(() => toUblXml(full, cfg), [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const req = requestInfo(full, cfg);
  // Invoices delivered before the Qvalia integration have no stored response: rebuild the 200 body from what we kept.
  const resp = inv.wlResponse || (inv.status === 'Success' && inv.wlInvoiceId
    ? { http: 200, body: { status: 'success', data: { message: 'Invoice received', integrationId: inv.wlInvoiceId, invoice_id: inv.id } } }
    : inv.status === 'Failed' && inv.lastError ? { http: Number.parseInt(inv.lastError, 10) || 500, body: { status: 'error', data: { message: inv.lastError } } } : null);
  const text = view === 'json' ? json : view === 'xml' ? xml : view === 'response' ? JSON.stringify(resp?.body ?? { note: 'No response yet' }, null, 2) : '';

  const copy = () => { try { navigator.clipboard.writeText(text); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const download = () => {
    const blob = new Blob([text], { type: view === 'xml' ? 'application/xml' : 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${inv.id}${view === 'response' ? '-response' : ''}.${view === 'xml' ? 'xml' : 'json'}`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="qv-box">
      <div className="flex between items-center wrap gap-1">
        <h4 className="mb-0">{t('E-invoice sent to Qvalia')}</h4>
        <span className="badge blue" dir="ltr">{PROFILES[cfg.profile]?.label || cfg.profile}</span>
      </div>
      <div className="qv-req" dir="ltr">
        <b>{req.method}</b> <span>{req.url}</span>
        <div className="qv-headers">
          {Object.entries(req.headers).map(([k, v]) => <div key={k}><i>{k}:</i> {v}</div>)}
        </div>
      </div>
      <div className="flex between items-center wrap gap-1 mt-1">
        <div className="seg-mini">
          <button className={view === 'json' ? 'on' : ''} onClick={() => setView('json')}><FileJson size={14} /> JSON</button>
          <button className={view === 'xml' ? 'on' : ''} onClick={() => setView('xml')}><FileCode2 size={14} /> UBL XML</button>
          <button className={view === 'response' ? 'on' : ''} onClick={() => setView('response')}><Inbox size={14} /> {t('Response')}{resp ? ` ${resp.http || ''}` : ''}</button>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-outline btn-sm" onClick={copy}><Copy size={14} /> {t(copied ? 'Copied' : 'Copy')}</button>
          <button className="btn btn-outline btn-sm" onClick={download}><Download size={14} /> {t('Download')}</button>
        </div>
      </div>
      <pre className="code qv-code" dir="ltr">{text}</pre>
      <p className="muted mb-0" style={{ fontSize: 12.5 }}>
        <Send size={12} /> {t(cfg.mode === 'proxy' ? 'Live: sent through your backend proxy to Qvalia {env}.' : 'Simulation: the request is not sent. Switch to live in Admin → Integrations.', { env: cfg.environment })}
      </p>
    </div>
  );
}
