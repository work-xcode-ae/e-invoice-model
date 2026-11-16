// Finance and management reports (RPT-01..RPT-05, INV-09, PRT-08, CRM reports).
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle2, Upload, FileDown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import ReportGrid from '../../components/ReportGrid';
import { allDocsWithCompany } from '../../services/modelDocs';
import { getReconciliations, importPartnerInvoice, resolveDifference } from '../../services/integration';
import { staffKpis } from '../../services/tasks';
import { crmReport, LEAD_STAGES } from '../../services/crm';
import { getCommissions } from '../../services/partners';
import { read, write } from '../../services/api';
import { addAudit } from '../../services/audit';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { exportCsv } from '../../services/exporters';

const CLOSED_KEY = 'mei_closed_months';
const monthOf = (d) => String(d).slice(0, 7);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const TYPE_OF = (l, d) => (l.kind === 'overage' ? 'Extra documents' : l.kind === 'setup' ? 'Setup fees' : l.kind === 'discount' ? 'Discounts' : l.kind === 'credit' && d.type === 'Invoice' ? 'Discounts' : l.kind === 'ad' ? 'Advertising' : l.kind === 'consulting' ? 'Consulting' : d.kind === 'Upgrade' ? 'Upgrades' : d.kind === 'Renewal' ? 'Renewals' : d.kind === 'Enterprise' || d.kind === 'Manual' ? 'Enterprise and manual' : 'New subscriptions');

/** Months covered by an annual subscription line from its invoice date (straight-line recognition). */
const isAnnualLine = (l) => l.kind === 'package' && (l.desc?.vars?.period === 'Annual');

function revenueFor(month) {
  const docs = allDocsWithCompany();
  const rows = {};
  const add = (k, field, v) => { rows[k] = rows[k] || { type: k, invoiced: 0, discounts: 0, credits: 0, net: 0, deferred: 0, recognised: 0 }; rows[k][field] += v; };
  let deferredBalance = 0;
  docs.forEach((d) => {
    const m = monthOf(d.date);
    d.lines.forEach((l) => {
      const type = TYPE_OF(l, d);
      const amt = Number(l.amount) || 0;
      if (d.type === 'Credit note') { if (m === month) add(type === 'Discounts' ? 'New subscriptions' : type, 'credits', -Math.abs(amt)); return; }
      if (isAnnualLine(l)) {
        const start = new Date(d.date); const monthsIn = (new Date(`${month}-01`).getFullYear() - start.getFullYear()) * 12 + (new Date(`${month}-01`).getMonth() - start.getMonth());
        if (m === month) add(type, 'invoiced', amt);
        if (monthsIn >= 0 && monthsIn < 12) add(type, 'recognised', amt / 12);
        if (monthsIn >= 0 && monthsIn < 12) deferredBalance += amt * (11 - monthsIn) / 12;
        return;
      }
      if (m !== month) return;
      if (amt < 0) add(type === 'Discounts' ? 'Discounts' : type, 'discounts', amt);
      else { add(type, 'invoiced', amt); add(type, 'recognised', amt); }
    });
  });
  const list = Object.values(rows).map((r) => ({ ...r, net: +(r.invoiced + r.discounts + r.credits).toFixed(2), recognised: +(r.recognised + r.discounts + r.credits).toFixed(2), invoiced: +r.invoiced.toFixed(2), discounts: +r.discounts.toFixed(2), credits: +r.credits.toFixed(2) }));
  const vat = docs.filter((d) => monthOf(d.date) === month).reduce((s, d) => s + (d.type === 'Credit note' ? -d.vat : d.vat), 0);
  return { rows: list, deferredBalance: +deferredBalance.toFixed(2), vat: +vat.toFixed(2), docs: docs.filter((d) => monthOf(d.date) === month) };
}

export function AdminFinance() {
  const { t } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  const lv = staffLevel('reports');
  const TABS = [
    ['revenue', 'Monthly revenue', ['full']], ['vat', 'VAT payable', ['full']], ['aging', 'Debt aging', ['full']], ['discounts', 'Discounts granted', ['full']],
    ['profit', 'Sales and profit', ['full']], ['recon', 'Reconciliation', ['full', 'tech']], ['kpi', 'Staff performance', ['full', 'own']], ['crm', 'CRM', ['full']],
  ].filter(([, , who]) => who.includes(lv));
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : TABS[0]?.[0];
  return (
    <>
      <PageTitle title="Finance and management reports" sub="Revenue for the accounts, VAT, aging, reconciliation with the technical partner, staff performance and CRM." />
      <div className="subtabs mb-2">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>{t(l)}</button>)}</div>
      {tab === 'revenue' && <Revenue />}
      {tab === 'vat' && <Vat />}
      {tab === 'aging' && <Aging />}
      {tab === 'discounts' && <Discounts />}
      {tab === 'profit' && <Profit />}
      {tab === 'recon' && <Recon />}
      {tab === 'kpi' && <Kpi own={lv === 'own'} />}
      {tab === 'crm' && <Crm />}
    </>
  );
}

function MonthPick({ value, onChange }) {
  return <input className="input input-sm" type="month" dir="ltr" style={{ maxWidth: 170 }} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

function Revenue() {
  const { t, locale } = useLang();
  const [m, setM] = useState(thisMonth());
  const r = useMemo(() => revenueFor(m), [m]);
  const closed = read(CLOSED_KEY, {})[m];
  const close = () => { write(CLOSED_KEY, { ...read(CLOSED_KEY, {}), [m]: { at: new Date().toISOString(), by: JSON.parse(localStorage.getItem('mei_session'))?.user?.fullName } }); addAudit({ area: 'Finance', action: 'Month closed', entity: m, before: null, after: 'closed' }); };
  const journal = () => {
    const rows = [];
    r.docs.forEach((d) => {
      const cn = d.type === 'Credit note';
      const sign = cn ? -1 : 1;
      rows.push({ date: d.date.slice(0, 10), doc: d.id, account: d.status === 'Paid' || cn ? '1100 Bank / card clearing' : '1200 Accounts receivable', debit: cn ? 0 : d.total, credit: cn ? d.total : 0, memo: d.company });
      d.lines.forEach((l) => {
        const ann = isAnnualLine(l) && !cn;
        rows.push({ date: d.date.slice(0, 10), doc: d.id, account: ann ? '2400 Deferred revenue' : l.amount < 0 ? '4900 Discounts given' : `4${{ overage: '200', setup: '300', ad: '500', consulting: '400' }[l.kind] || '100'} ${t(TYPE_OF(l, d))}`, debit: (l.amount < 0) !== cn ? Math.abs(l.amount) : 0, credit: (l.amount < 0) !== cn ? 0 : Math.abs(l.amount), memo: d.id });
      });
      rows.push({ date: d.date.slice(0, 10), doc: d.id, account: '2200 VAT payable', debit: cn ? d.vat : 0, credit: cn ? 0 : d.vat * sign, memo: '' });
    });
    exportCsv({ columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'doc', label: 'Document' }, { key: 'account', label: 'Account' }, { key: 'debit', label: 'Debit', type: 'money' }, { key: 'credit', label: 'Credit', type: 'money' }, { key: 'memo', label: 'Memo' }], rows, fileName: `journal-${m}` });
  };
  const total = r.rows.reduce((s, x) => s + x.net, 0);
  return (
    <div className="card">
      <div className="flex between items-center wrap gap-1 mb-2">
        <div className="flex gap-1 items-center"><MonthPick value={m} onChange={setM} />{closed && <span className="badge gray"><Lock size={12} /> {t('Closed by {by} on {date}', { by: closed.by, date: fmtDate(closed.at, locale) })}</span>}</div>
        <div className="flex gap-1"><button className="btn btn-outline btn-sm" onClick={journal}><FileDown size={14} /> {t('Journal entries (CSV)')}</button>{!closed && <button className="btn btn-primary btn-sm" onClick={close}><Lock size={14} /> {t('Close the month')}</button>}</div>
      </div>
      <div className="kv-grid mb-2">
        <div><span>{t('Net invoiced (excl. VAT)')}</span><b dir="ltr">{formatMoney(total.toFixed(2))}</b></div>
        <div><span>{t('VAT for the month')}</span><b dir="ltr">{formatMoney(r.vat)}</b></div>
        <div><span>{t('Recognised revenue')}</span><b dir="ltr">{formatMoney(r.rows.reduce((s, x) => s + x.recognised, 0).toFixed(2))}</b></div>
        <div><span>{t('Deferred revenue balance (annual plans)')}</span><b dir="ltr">{formatMoney(r.deferredBalance)}</b></div>
      </div>
      <ReportGrid key={m} title={t('Monthly revenue {m}', { m })} fileName={`revenue-${m}`} meta={[t('Excl. VAT')]} rows={r.rows}
        columns={[{ key: 'type', label: 'Type', translate: true }, { key: 'invoiced', label: 'Invoiced', type: 'money' }, { key: 'discounts', label: 'Discounts', type: 'money' }, { key: 'credits', label: 'Credit notes', type: 'money' }, { key: 'net', label: 'Net', type: 'money' }, { key: 'recognised', label: 'Recognised this month', type: 'money' }]} />
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('The total matches the invoices and credit notes of the month. Annual subscriptions are recognised over 12 months; the rest is deferred revenue.')}</p>
    </div>
  );
}

function Vat() {
  const { t } = useLang();
  const [from, setFrom] = useState(`${thisMonth()}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const rows = allDocsWithCompany().filter((d) => d.date.slice(0, 10) >= from && d.date.slice(0, 10) <= to).map((d) => {
    const s = d.type === 'Credit note' ? -1 : 1;
    return { date: d.date, id: d.id, type: d.type, company: d.company, trn: d.customer.trn || '—', net: s * d.subtotal, vat: s * d.vat, total: s * d.total };
  });
  return (
    <div className="card">
      <ReportGrid key={from + to} title={t('VAT payable')} fileName={`vat-${from}-${to}`} rows={rows} initialSort={{ key: 'date', dir: 'asc' }}
        toolbar={<div className="flex gap-1"><input className="input input-sm" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /><input className="input input-sm" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></div>}
        columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'id', label: 'Document', ltr: true }, { key: 'type', label: 'Type', translate: true }, { key: 'company', label: 'Customer' }, { key: 'trn', label: 'TRN', ltr: true }, { key: 'net', label: 'Excl. VAT', type: 'money' }, { key: 'vat', label: 'VAT', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }]} />
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Totals match the invoice register: credit notes reduce the VAT payable.')}</p>
    </div>
  );
}

function Aging() {
  const { t } = useLang();
  const now = Date.now();
  const rows = allDocsWithCompany().filter((d) => d.type === 'Invoice' && d.status !== 'Paid').map((d) => {
    const days = Math.floor((now - new Date(d.date)) / 86400000);
    const b = days <= 30 ? 'b0' : days <= 60 ? 'b30' : days <= 90 ? 'b60' : 'b90';
    return { id: d.id, company: d.company, date: d.date, days, b0: b === 'b0' ? d.total : 0, b30: b === 'b30' ? d.total : 0, b60: b === 'b60' ? d.total : 0, b90: b === 'b90' ? d.total : 0, total: d.total };
  });
  return (
    <div className="card">
      <ReportGrid title={t('Debt aging')} fileName="aging" rows={rows}
        columns={[{ key: 'id', label: 'Invoice', ltr: true }, { key: 'company', label: 'Customer' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'days', label: 'Days', type: 'number', total: false }, { key: 'b0', label: '0–30', type: 'money' }, { key: 'b30', label: '31–60', type: 'money' }, { key: 'b60', label: '61–90', type: 'money' }, { key: 'b90', label: '90+', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }]} empty="No unpaid invoices." />
    </div>
  );
}

function Discounts() {
  const { t } = useLang();
  const rows = allDocsWithCompany().flatMap((d) => d.lines.filter((l) => l.kind === 'discount').map((l) => ({ date: d.date, id: d.id, company: d.company, label: typeof l.desc === 'string' ? l.desc : t(l.desc.key, l.desc.vars), amount: Math.abs(l.amount) })));
  return <div className="card"><ReportGrid title={t('Discounts granted')} fileName="discounts" rows={rows} columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'id', label: 'Invoice', ltr: true }, { key: 'company', label: 'Customer' }, { key: 'label', label: 'Discount' }, { key: 'amount', label: 'Amount', type: 'money' }]} empty="No discounts yet." /></div>;
}

function Profit() {
  const { t } = useLang();
  const recs = getReconciliations();
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
  const cms = getCommissions();
  const rows = months.map((m) => {
    const r = revenueFor(m);
    const revenue = r.rows.reduce((s, x) => s + x.net, 0);
    const cost = recs[m]?.partnerInvoice?.amount || 0;
    const comm = cms.filter((c) => monthOf(c.paidAt) === m && !['Cancelled'].includes(c.status)).reduce((s, c) => s + c.amount, 0);
    return { month: m, revenue: +revenue.toFixed(2), cost: +cost.toFixed(2), commissions: +comm.toFixed(2), profit: +(revenue - cost - comm).toFixed(2), margin: revenue ? ((revenue - cost - comm) / revenue) * 100 : 0, actual: recs[m] ? t('Actual') : t('No partner invoice yet') };
  });
  return (
    <div className="card">
      <ReportGrid title={t('Sales and profit')} fileName="profit" rows={rows} totals
        columns={[{ key: 'month', label: 'Month' }, { key: 'revenue', label: 'Net revenue', type: 'money' }, { key: 'cost', label: 'Technical partner cost', type: 'money' }, { key: 'commissions', label: 'Partner commissions', type: 'money' }, { key: 'profit', label: 'Profit', type: 'money' }, { key: 'margin', label: 'Margin', type: 'percent' }, { key: 'actual', label: 'Cost source' }]} />
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Uses the actual cost from the technical partner’s monthly invoice (Reconciliation) and deducts partner commissions. Visible to the manager and the owner only.')}</p>
    </div>
  );
}

function Recon() {
  const { t, locale } = useLang();
  const recs = getReconciliations();
  const keys = Object.keys(recs).sort().reverse();
  const [m, setM] = useState(keys[0] || thisMonth());
  const [note, setNote] = useState({});
  const [err, setErr] = useState('');
  const rec = recs[m];
  const imp = () => { try { setErr(''); importPartnerInvoice(m); } catch (e) { setErr(e); } };
  return (
    <div className="card">
      <div className="flex between items-center wrap gap-1 mb-2">
        <div className="flex gap-1 items-center"><MonthPick value={m} onChange={setM} />{keys.map((k) => <button key={k} className={`chip ${k === m ? 'on' : ''}`} onClick={() => setM(k)}>{k}</button>)}</div>
        <button className="btn btn-outline btn-sm" onClick={imp}><Upload size={14} /> {t(rec ? 'Import again' : 'Import the partner’s invoice')}</button>
      </div>
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {!rec ? <p className="muted">{t('No invoice from the technical partner for this month yet.')}</p> : (
        <>
          <div className="kv-grid mb-2">
            <div><span>{t('Partner invoice')}</span><b dir="ltr">{rec.partnerInvoice.number}</b></div>
            <div><span>{t('Documents billed')}</span><b dir="ltr">{rec.partnerInvoice.docs.toLocaleString()}</b></div>
            <div><span>{t('Amount')}</span><b dir="ltr">{formatMoney(rec.partnerInvoice.amount)}</b></div>
            <div><span>{t('Differences')}</span><b>{rec.rows.filter((r) => r.status === 'Difference').length} {t('open')} · {rec.rows.filter((r) => r.status === 'Resolved').length} {t('resolved')}</b></div>
          </div>
          <ReportGrid key={m + rec.importedAt} title={t('Reconciliation {m}', { m })} fileName={`reconciliation-${m}`} meta={[rec.partnerInvoice.number]} rows={rec.rows} columns={[{ key: 'company', label: 'Customer' }, { key: 'ours', label: 'Our count', type: 'number' }, { key: 'theirs', label: 'Partner count', type: 'number' }, { key: 'diff', label: 'Difference', type: 'number' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'note', label: 'Note' }]} />
          {rec.rows.filter((r) => r.status === 'Difference').map((r) => (
            <div key={r.customerId} className="flex gap-1 items-center mt-1"><AlertTriangle size={15} color="#f59e0b" /><b>{r.company}</b><span className="muted">({r.diff > 0 ? '+' : ''}{r.diff})</span><input className="input input-sm" placeholder={t('How was it resolved?')} value={note[r.customerId] || ''} onChange={(e) => setNote({ ...note, [r.customerId]: e.target.value })} /><button className="btn btn-outline btn-sm" onClick={() => { try { resolveDifference(m, r.customerId, note[r.customerId]); } catch (e) { setErr(e); } }}><CheckCircle2 size={14} /> {t('Resolve')}</button></div>
          ))}
          <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Imported {date}. Every difference has a status and a task.', { date: fmtDateTime(rec.importedAt, locale) })}</p>
        </>
      )}
    </div>
  );
}

function Kpi({ own }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [m, setM] = useState(thisMonth());
  const from = `${m}-01T00:00:00.000Z`; const d = new Date(`${m}-01`); d.setMonth(d.getMonth() + 1);
  const rows = staffKpis(from, d.toISOString()).filter((r) => !own || r.id === user.id).map((r) => ({ ...r, roles: r.roles.map((x) => t(x)).join(', '), slaPct: r.slaPct * 100 }));
  return (
    <div className="card">
      <ReportGrid key={m} title={t('Staff performance {m}', { m })} fileName={`kpi-${m}`} rows={rows} totals={false} toolbar={<MonthPick value={m} onChange={setM} />}
        columns={[{ key: 'rank', label: 'Rank', type: 'number' }, { key: 'name', label: 'Name' }, { key: 'roles', label: 'Roles' }, { key: 'assigned', label: 'Assigned', type: 'number' }, { key: 'done', label: 'Done', type: 'number' }, { key: 'slaPct', label: 'On time', type: 'percent' }, { key: 'escalated', label: 'Escalated', type: 'number' }, { key: 'score', label: 'Score', type: 'number' }]} />
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t(own ? 'You see your own figures only.' : 'Weights come from Settings → Staff performance.')}</p>
    </div>
  );
}

function Crm() {
  const { t } = useLang();
  const r = crmReport();
  return (
    <div className="card">
      <div className="kv-grid mb-2">{LEAD_STAGES.map((s) => <div key={s}><span>{t(s)}</span><b>{r.byStage[s]}</b></div>)}</div>
      <ReportGrid title={t('Leads by source')} fileName="crm-sources" rows={r.bySource.map((x) => ({ ...x, conversion: x.conversion * 100 }))} columns={[{ key: 'source', label: 'Source', translate: true }, { key: 'leads', label: 'Leads', type: 'number' }, { key: 'won', label: 'Won', type: 'number' }, { key: 'lost', label: 'Lost', type: 'number' }, { key: 'conversion', label: 'Conversion', type: 'percent' }]} />
      <h4 className="mt-2">{t('Loss reasons')}</h4>
      <ul className="tl-mini">{Object.entries(r.lossReasons).map(([k, v]) => <li key={k}>{t(k)} · <b>{v}</b></li>)}</ul>
    </div>
  );
}
