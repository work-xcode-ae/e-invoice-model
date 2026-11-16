// Partners for the manager (PRT-01..PRT-08): applications, plans, customers, commissions, statements, payouts, reports.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, CheckCircle2, Play, Ban, FileCheck2, Banknote, FileSpreadsheet, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { PageTitle } from '../admin/Admin';
import { getPartners, getPartner, startReview, rejectPartner, assignPlan, setPartnerStatus, customersOf, commissionsOf, getCommissions, getStatements, createStatement, approveStatement, attachPartnerInvoice, payStatement, partnerBalance, releaseCommissions } from '../../services/partners';
import { getPlatform } from '../../services/platform';
import { stageOf, STAGE_BADGE } from '../../services/lifecycle';
import { exportExcel } from '../../services/exporters';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime } from '../../utils/format';

const P_BADGE = { Applied: 'orange', 'Under review': 'blue', 'Plan assigned': 'purple', Active: 'green', Suspended: 'red', Rejected: 'gray' };
const C_BADGE = { Held: 'orange', Due: 'blue', 'In statement': 'purple', Paid: 'green', Cancelled: 'gray', Reversal: 'red' };
const S_BADGE = { 'Sent to partner': 'orange', Objected: 'red', 'Confirmed by partner': 'blue', Approved: 'blue', 'Invoice received': 'purple', Paid: 'green' };

export function AdminPartners() {
  const { t } = useLang();
  const { staffLevel } = useAuth();
  useDbVersion();
  releaseCommissions();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'partners';
  const open = params.get('p');
  const edit = staffLevel('partners') === 'full';
  return (
    <>
      <PageTitle title="Partners" sub="Applications, commission plans, referred customers, commissions and payouts." />
      <div className="subtabs mb-2">{[['partners', 'Partners'], ['commissions', 'Commissions'], ['statements', 'Statements and payouts'], ['reports', 'Reports']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>{t(l)}</button>)}</div>
      {tab === 'partners' && <PartnerList onOpen={(id) => setParams({ tab, p: id })} />}
      {tab === 'commissions' && <CommissionList />}
      {tab === 'statements' && <Statements edit={edit} />}
      {tab === 'reports' && <Reports />}
      {open && getPartner(open) && <PartnerDrawer id={open} edit={edit} onClose={() => setParams({ tab })} />}
    </>
  );
}

function PartnerList({ onOpen }) {
  const { t, locale } = useLang();
  const list = getPartners();
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Partner')}</th><th>{t('Type')}</th><th>{t('Status')}</th><th>{t('Code')}</th><th>{t('Customers')}</th><th>{t('Due')}</th><th>{t('Paid')}</th><th>{t('Since')}</th></tr></thead>
          <tbody>
            {list.map((p) => {
              const b = partnerBalance(p.id);
              return (
                <tr key={p.id} className="row-click" onClick={() => onOpen(p.id)}>
                  <td><b>{p.name}</b><small className="muted" style={{ display: 'block' }}>{p.contactName} · {p.email}</small></td>
                  <td>{t(p.type)}</td><td><span className={`badge ${P_BADGE[p.status]}`}>{t(p.status)}</span></td>
                  <td dir="ltr">{p.code || '—'}</td><td>{customersOf(p.id).length}</td>
                  <td dir="ltr">{formatMoney(b.due)}</td><td dir="ltr">{formatMoney(b.paid)}</td><td className="muted">{fmtDate(p.createdAt, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PartnerDrawer({ id, edit, onClose }) {
  const { t, locale } = useLang();
  const p = getPartner(id);
  const pl = getPlatform();
  const [plan, setPlan] = useState(p.plan || { ...pl.commissionTemplates.find((x) => x.name === p.type) || pl.commissionTemplates[0] });
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const act = (fn) => { try { setErr(''); fn(); } catch (e) { setErr(e); } };
  const set = (k, v) => setPlan({ ...plan, [k]: v });
  const customers = customersOf(p.id);
  const cms = commissionsOf(p.id);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" style={{ width: 'min(780px, 100vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="muted" style={{ fontSize: 13 }}>{p.id} · {t(p.type)}</span><h3 className="mb-0">{p.name}</h3></div><div className="flex items-center gap-1"><span className={`badge ${P_BADGE[p.status]}`}>{t(p.status)}</span><button className="ab-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button></div></div>
        {err && <div className="alert error mb-2">{errText(t, err)}</div>}
        <div className="kv-grid">
          <div><span>{t('Contact')}</span><b>{p.contactName}</b></div><div><span>{t('Email')}</span><b dir="ltr">{p.email}</b></div>
          <div><span>{t('Trade licence')}</span><b dir="ltr">{p.tradeLicense || '—'}</b></div><div><span>{t('TRN')}</span><b dir="ltr">{p.trn || '—'}</b></div>
          <div><span>{t('Referral code')}</span><b dir="ltr">{p.code || t('Issued after the agreement is accepted')}</b></div>
          <div><span>{t('Agreement')}</span><b>{p.agreement ? t('v{v} on {date}', { v: p.agreement.version, date: fmtDate(p.agreement.at, locale) }) : '—'}</b></div>
          <div><span>{t('Bank account')}</span><b dir="ltr">{p.bank ? `${p.bank.bankName} ••${p.bank.iban.slice(-4)} ${p.bank.verified ? '✓' : ''}` : '—'}</b></div>
          <div><span>{t('Documents')}</span><b>{(p.docs || []).map((d) => d.name).join(', ') || '—'}</b></div>
          {p.message && <div className="full"><span>{t('Message')}</span><b>{p.message}</b></div>}
        </div>

        {edit && ['Applied', 'Under review'].includes(p.status) && (
          <div className="flex gap-1 wrap mt-2">
            {p.status === 'Applied' && <button className="btn btn-outline btn-sm" onClick={() => act(() => startReview(p.id))}><Play size={14} /> {t('Start review')}</button>}
            <input className="input input-sm" style={{ maxWidth: 260 }} placeholder={t('Reason for rejection')} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-outline btn-sm" onClick={() => act(() => rejectPartner(p.id, note))}><Ban size={14} /> {t('Reject')}</button>
          </div>
        )}

        {edit && p.status !== 'Rejected' && (
          <div className="card-soft mt-2">
            <b>{t(p.plan ? 'Commission plan' : 'Assign a commission plan')}</b>
            <div className="chip-group mt-1">{pl.commissionTemplates.map((tp) => <button key={tp.id} className="chip" onClick={() => setPlan({ ...tp })}>{t('Template: {name}', { name: t(tp.name) })}</button>)}</div>
            <div className="form-grid mt-1">
              {[['newRate', 'New subscription %'], ['renewalRate', 'Renewal %'], ['upgradeRate', 'Upgrade %'], ['holdDays', 'Hold days'], ['minPayout', 'Minimum payout (AED)'], ['months', 'Months of commission (0 = no limit)']].map(([k, l]) => <div className="field" key={k}><label>{t(l)}</label><input className="input input-sm" type="number" dir="ltr" value={plan[k]} onChange={(e) => set(k, Number(e.target.value))} /></div>)}
              <div className="field"><label>{t('Statement cycle')}</label><select className="input input-sm" value={plan.cycle} onChange={(e) => set('cycle', e.target.value)}><option>Monthly</option><option>Quarterly</option></select></div>
              <label className="checkbox"><input type="checkbox" checked={!!plan.includeSetup} onChange={(e) => set('includeSetup', e.target.checked)} /> {t('Include setup fee')}</label>
              <label className="checkbox"><input type="checkbox" checked={!!plan.includeOverage} onChange={(e) => set('includeOverage', e.target.checked)} /> {t('Include extra documents')}</label>
            </div>
            <button className="btn btn-primary btn-sm mt-1" onClick={() => act(() => assignPlan(p.id, plan))}><CheckCircle2 size={14} /> {t(p.plan ? 'Save plan (new payments only)' : 'Assign plan')}</button>
            {p.status === 'Plan assigned' && <p className="muted mt-1 mb-0" style={{ fontSize: 13 }}>{t('Waiting for the partner to accept the agreement in the partner portal. No referral code before that.')}</p>}
          </div>
        )}
        {edit && ['Active', 'Suspended'].includes(p.status) && <button className="btn btn-outline btn-sm mt-2" onClick={() => setPartnerStatus(p.id, p.status === 'Active' ? 'Suspended' : 'Active')}>{t(p.status === 'Active' ? 'Suspend partner' : 'Reactivate partner')}</button>}

        <h4 className="mt-2">{t('Referred customers')}</h4>
        <ul className="tl-mini">{customers.map((u) => <li key={u.id}><b>{u.company?.name}</b> · <span className={`badge ${STAGE_BADGE[stageOf(u)]}`}>{t(stageOf(u))}</span> · {t(u.partner.method)} · {fmtDate(u.partner.at, locale)}</li>)}{!customers.length && <li className="muted">{t('None yet.')}</li>}</ul>
        <h4 className="mt-2">{t('Users')}</h4>
        <ul className="tl-mini">{p.users.map((u) => <li key={u.id}>{u.name} · <span dir="ltr">{u.email}</span> · {t(u.role)} · {t(u.status)}</li>)}</ul>
        <h4 className="mt-2">{t('Commissions')}</h4>
        <ul className="tl-mini">{cms.slice(0, 10).map((c) => <li key={c.id}><span dir="ltr">{c.id}</span> · {c.company} · {t(c.type)} · {c.rate}% · <b dir="ltr">{formatMoney(c.amount)}</b> · <span className={`badge ${C_BADGE[c.status] || 'gray'}`}>{t(c.status)}</span></li>)}</ul>
        <h4 className="mt-2">{t('History')}</h4>
        <ul className="tl-mini">{[...p.history].reverse().map((h, i) => <li key={i}><small className="muted">{fmtDateTime(h.at, locale)}</small> · {t(h.action, h.vars)} · {h.by}{h.note ? ` · ${h.note}` : ''}</li>)}</ul>
      </aside>
    </div>
  );
}

function CommissionList() {
  const { t, locale } = useLang();
  const [st, setSt] = useState('');
  const list = getCommissions().filter((c) => !st || c.status === st);
  const names = Object.fromEntries(getPartners().map((p) => [p.id, p.name]));
  return (
    <div className="card">
      <select className="input input-sm mb-2" style={{ maxWidth: 200 }} value={st} onChange={(e) => setSt(e.target.value)}><option value="">{t('All')}</option>{['Held', 'Due', 'In statement', 'Paid', 'Cancelled'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Commission')}</th><th>{t('Partner')}</th><th>{t('Customer')}</th><th>{t('Invoice')}</th><th>{t('Type')}</th><th>{t('Base')}</th><th>{t('Rate')}</th><th>{t('Amount')}</th><th>{t('Held until')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>{list.map((c) => <tr key={c.id}><td dir="ltr">{c.id}</td><td>{names[c.partnerId]}</td><td>{c.company}</td><td dir="ltr">{c.invoiceId}</td><td>{t(c.type)}</td><td dir="ltr">{formatMoney(c.base)}</td><td>{c.rate}%</td><td dir="ltr"><b>{formatMoney(c.amount)}</b></td><td>{fmtDate(c.holdUntil, locale)}</td><td><span className={`badge ${C_BADGE[c.status] || 'gray'}`}>{t(c.status)}</span></td></tr>)}</tbody>
        </table>
      </div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Commission is calculated after discount and without VAT. It is held until the customer is active and the hold period has passed; a refund in that window cancels it, a later exceptional refund reverses it.')}</p>
    </div>
  );
}

function Statements({ edit }) {
  const { t, locale } = useLang();
  const [pid, setPid] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [inv, setInv] = useState({});
  const [ref, setRef] = useState({});
  const [err, setErr] = useState('');
  const act = (fn) => { try { setErr(''); fn(); } catch (e) { setErr(e); } };
  return (
    <>
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {edit && (
        <div className="card mb-2">
          <h3>{t('New statement')}</h3>
          <div className="flex gap-1 wrap"><select className="input input-sm" style={{ maxWidth: 240 }} value={pid} onChange={(e) => setPid(e.target.value)}><option value="">{t('Partner')}</option>{getPartners().filter((p) => p.status === 'Active').map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(partnerBalance(p.id).due)}</option>)}</select>
            <input className="input input-sm" type="month" dir="ltr" style={{ maxWidth: 170 }} value={period} onChange={(e) => setPeriod(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={!pid} onClick={() => act(() => createStatement(pid, period))}><Plus size={14} /> {t('Create and send')}</button></div>
        </div>
      )}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Statement')}</th><th>{t('Partner')}</th><th>{t('Period')}</th><th>{t('Total')}</th><th>{t('Status')}</th><th>{t('Next step')}</th></tr></thead>
            <tbody>
              {getStatements().map((s) => (
                <tr key={s.id}>
                  <td dir="ltr"><b>{s.id}</b><small className="muted" style={{ display: 'block' }}>{fmtDate(s.createdAt, locale)}</small></td>
                  <td>{s.partnerName}</td><td>{s.period}</td><td dir="ltr"><b>{formatMoney(s.total)}</b></td>
                  <td><span className={`badge ${S_BADGE[s.status] || 'gray'}`}>{t(s.status)}</span>{s.objection && <small className="text-danger" style={{ display: 'block' }}>{s.objection}</small>}</td>
                  <td>
                    {edit && ['Sent to partner', 'Confirmed by partner', 'Objected'].includes(s.status) && <button className="btn btn-outline btn-sm" onClick={() => act(() => approveStatement(s.id))}><FileCheck2 size={14} /> {t('Approve')}</button>}
                    {edit && s.status === 'Approved' && <div className="flex gap-1 wrap"><input className="input input-sm" dir="ltr" style={{ maxWidth: 130 }} placeholder={t('Invoice no.')} value={inv[s.id] || ''} onChange={(e) => setInv({ ...inv, [s.id]: e.target.value })} /><button className="btn btn-outline btn-sm" onClick={() => act(() => attachPartnerInvoice(s.id, { number: inv[s.id], amount: s.total, fileName: `${inv[s.id]}.pdf` }))}>{t('Invoice received')}</button><button className="btn btn-outline btn-sm" onClick={() => act(() => attachPartnerInvoice(s.id, { selfBilling: true }))}>{t('Self-billing')}</button></div>}
                    {edit && s.status === 'Invoice received' && <div className="flex gap-1"><input className="input input-sm" dir="ltr" style={{ maxWidth: 150 }} placeholder={t('Transfer reference')} value={ref[s.id] || ''} onChange={(e) => setRef({ ...ref, [s.id]: e.target.value })} /><button className="btn btn-primary btn-sm" onClick={() => act(() => payStatement(s.id, ref[s.id]))}><Banknote size={14} /> {t('Mark paid')}</button></div>}
                    {s.status === 'Paid' && <span className="muted" dir="ltr">{s.payout?.ref}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('No payout without an approved statement and a matching invoice (or a self-billing invoice).')}</p>
      </div>
    </>
  );
}

function Reports() {
  const { t } = useLang();
  const partners = getPartners();
  const cms = getCommissions();
  const rows = partners.map((p) => {
    const mine = cms.filter((c) => c.partnerId === p.id);
    const sum = (f) => +mine.filter(f).reduce((s, c) => s + c.amount, 0).toFixed(2);
    return { partner: p.name, type: p.type, customers: customersOf(p.id).length, revenue: +mine.filter((c) => c.amount > 0).reduce((s, c) => s + c.base, 0).toFixed(2), earned: sum((c) => !['Cancelled'].includes(c.status)), unpaid: sum((c) => ['Held', 'Due', 'In statement'].includes(c.status)), paid: sum((c) => c.status === 'Paid') };
  });
  const cols = [{ key: 'partner', label: 'Partner' }, { key: 'type', label: 'Type' }, { key: 'customers', label: 'Customers', type: 'number' }, { key: 'revenue', label: 'Revenue through the partner', type: 'money' }, { key: 'earned', label: 'Commission earned', type: 'money' }, { key: 'unpaid', label: 'Not paid yet', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' }];
  const xlsx = () => exportExcel({ title: t('Commissions by partner'), columns: cols.map((c) => ({ ...c, label: t(c.label) })), rows, totals: true, fileName: 'commissions-by-partner', labels: { total: t('Total'), generated: '' } });
  return (
    <div className="card">
      <div className="flex between items-center mb-2"><h3 className="mb-0">{t('Commissions by partner')}</h3><button className="btn btn-outline btn-sm" onClick={xlsx}><FileSpreadsheet size={14} /> Excel</button></div>
      <div className="table-wrap"><table><thead><tr>{cols.map((c) => <th key={c.key}>{t(c.label)}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.partner}>{cols.map((c) => <td key={c.key} dir={c.type ? 'ltr' : undefined}>{c.type === 'money' ? formatMoney(r[c.key]) : c.key === 'type' ? t(r[c.key]) : r[c.key]}</td>)}</tr>)}</tbody></table></div>
    </div>
  );
}
