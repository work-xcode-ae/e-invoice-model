// Partner portal (PRT-07, section 4.3): referred customers and their status, commissions and statements,
// leads, the "Are you obligated?" tool, bank details and users. A partner never sees a customer's invoices or
// tax data without the consent of the customer's manager.
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, CheckCircle2, Users, Banknote, FileText, UserPlus, Send, MessageCircle, Landmark, ShieldCheck, LogOut, Loader2, AlertTriangle, Handshake, Upload, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, errText } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { getPartner, acceptAgreement, customersOf, commissionsOf, partnerBalance, getStatements, objectStatement, confirmStatement, attachPartnerInvoice, saveBank, addPartnerUser, setPartnerUserStatus, partnerRegisterCheck } from '../../services/partners';
import { createLead, getLeads, sendInvite } from '../../services/crm';
import { stageOf, STAGE_BADGE } from '../../services/lifecycle';
import { docsOf } from '../../services/modelDocs';
import { getPlatform, currentPolicy } from '../../services/platform';
import { sendOtp } from '../../services/api';
import { formatMoney } from '../../data/packages';
import { fmtDate, fmtDateTime } from '../../utils/format';

const TABS = [['overview', 'Overview', Handshake, false], ['customers', 'Customers', Users, false], ['leads', 'Leads and invitations', UserPlus, false], ['commissions', 'Commissions and statements', Banknote, true], ['bank', 'Bank and company', Landmark, true], ['users', 'Users', KeyRound, true]];

export default function PartnerPortal() {
  const { t, lang } = useLang();
  const { isPartner, partnerId, partnerUser, logout } = useAuth();
  const navigate = useNavigate();
  useDbVersion();
  const [params, setParams] = useSearchParams();
  if (!isPartner) return <Navigate to="/login" replace />;
  const p = getPartner(partnerId);
  const am = partnerUser.role === 'Account manager';
  const tabs = TABS.filter(([, , , amOnly]) => !amOnly || am);
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';

  if (p.status === 'Plan assigned' || !p.agreement) return <Agreement p={p} am={am} />;

  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="admin-tag">{t('Partner portal')}</div>
        {tabs.map(([k, l, Icon]) => <a key={k} href={`?tab=${k}`} className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setParams({ tab: k }); }}><Icon size={18} /> {t(l)}</a>)}
        <div className="side-sep" />
        <button className="link" onClick={() => { logout(); navigate('/'); }}><LogOut size={18} /> {t('Logout')}</button>
      </aside>
      <main className="dash-main">
        <div className="mb-3"><h1 style={{ fontSize: 26 }}>{p.name}</h1><p className="muted mb-0">{partnerUser.name} · {t(partnerUser.role)} · {t(p.type)}</p></div>
        {tab === 'overview' && <Overview p={p} />}
        {tab === 'customers' && <Customers p={p} />}
        {tab === 'leads' && <Leads p={p} />}
        {tab === 'commissions' && <Commissions p={p} />}
        {tab === 'bank' && <BankCompany p={p} />}
        {tab === 'users' && <PartnerUsers p={p} me={partnerUser} />}
      </main>
    </div>
  );
}

function Agreement({ p, am }) {
  const { t, lang } = useLang();
  const { partnerUser } = useAuth();
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const v = currentPolicy('partnerAgreement');
  const pol = getPlatform().policies.partnerAgreement;
  return (
    <section className="section"><div className="container" style={{ maxWidth: 860 }}>
      <div className="card">
        <h2>{t('Welcome, {name}', { name: p.name })}</h2>
        <p>{t('Your application was approved. Review your commission plan and accept the partnership agreement to receive your referral code.')}</p>
        {p.plan && <div className="kv-grid mb-2">
          <div><span>{t('New subscription')}</span><b>{p.plan.newRate}%</b></div><div><span>{t('Renewal')}</span><b>{p.plan.renewalRate}%</b></div>
          <div><span>{t('Upgrade')}</span><b>{p.plan.upgradeRate}%</b></div><div><span>{t('Hold period')}</span><b>{t('{n} days', { n: p.plan.holdDays })}</b></div>
          <div><span>{t('Setup fee included')}</span><b>{t(p.plan.includeSetup ? 'Yes' : 'No')}</b></div><div><span>{t('Statement cycle')}</span><b>{t(p.plan.cycle)}</b></div>
        </div>}
        <div className="flex between items-center mb-1"><b>{lang === 'ar' ? pol.titleAr : t(pol.title)}</b><span className="badge gray">{t('Version {v}', { v: v.version })}</span></div>
        <div className="terms-box">{lang === 'ar' ? v.ar : v.en}</div>
        {err && <div className="alert error mt-1">{errText(t, err)}</div>}
        {am ? <>
          <label className="checkbox mt-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {t('I accept the partnership agreement, version {v}, on behalf of {name}.', { v: v.version, name: p.name })}</label>
          <button className="btn btn-primary mt-2" disabled={!ok} onClick={() => { try { acceptAgreement(p.id, partnerUser.name); } catch (e) { setErr(e); } }}><ShieldCheck size={15} /> {t('Accept and activate')}</button>
        </> : <div className="alert info mt-2">{t('Your account manager must accept the agreement first.')}</div>}
      </div>
    </div></section>
  );
}

function RefBox({ p }) {
  const { t } = useLang();
  const [copied, setCopied] = useState('');
  const link = `${window.location.origin}/?ref=${p.code}`;
  const tool = `${window.location.origin}/check?ref=${p.code}&by=${encodeURIComponent(p.name)}`;
  const copy = (k, v) => { navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="partner-hero">
      <div style={{ flex: 1, minWidth: 260 }}>
        <p>{t('Your referral code')}</p>
        <h2 dir="ltr">{p.code}</h2>
        <p style={{ fontSize: 13 }}>{t('Customers who register with your link (valid {n} days) or code are yours.', { n: getPlatform().durations.referralDays })}</p>
      </div>
      <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 280 }}>
        <div className="ref-link" dir="ltr"><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span><button className="btn btn-white btn-sm" onClick={() => copy('l', link)}>{copied === 'l' ? <CheckCircle2 size={14} /> : <Copy size={14} />}</button></div>
        <a className="btn btn-success btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${t('Check if your company must e-invoice:')} ${tool}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> {t('Send the “Are you obligated?” tool via WhatsApp')}</a>
      </div>
    </div>
  );
}

function Overview({ p }) {
  const { t } = useLang();
  const b = partnerBalance(p.id);
  const cs = customersOf(p.id);
  return (
    <>
      <RefBox p={p} />
      <div className="admin-kpis mt-2">
        {[['Customers', cs.length], ['Active customers', cs.filter((u) => stageOf(u) === 'Active').length], ['Held commission', formatMoney(b.held)], ['Due commission', formatMoney(b.due)], ['Paid to date', formatMoney(b.paid)]].map(([l, v]) => <div className="card kpi" key={l}><div><span>{t(l)}</span><strong dir="ltr">{v}</strong></div></div>)}
      </div>
    </>
  );
}

function Customers({ p }) {
  const { t, locale } = useLang();
  const cs = customersOf(p.id);
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Customer')}</th><th>{t('Stage')}</th><th>{t('Linking')}</th><th>{t('Package')}</th><th>{t('Since')}</th><th>{t('Model invoices')}</th></tr></thead>
          <tbody>
            {cs.map((u) => {
              const docs = u.partnerConsent ? docsOf(u.id) : null;
              return (
                <tr key={u.id}>
                  <td><b>{u.company?.name}</b></td>
                  <td><span className={`badge ${STAGE_BADGE[stageOf(u)]}`}>{t(stageOf(u))}</span></td>
                  <td><span className={`badge ${u.linking?.status === 'Linked' ? 'green' : 'gray'}`}>{t(u.linking?.status || 'Not started')}</span></td>
                  <td>{u.subscription ? t(u.subscription.packageName) : '—'}</td>
                  <td>{fmtDate(u.partner.at, locale)}</td>
                  <td>{docs ? `${docs.length} · ${formatMoney(docs.reduce((s, d) => s + (d.type === 'Credit note' ? -d.total : d.total), 0))}` : <span className="muted">{t('Hidden: no consent')}</span>}</td>
                </tr>
              );
            })}
            {!cs.length && <tr><td colSpan="6" className="center muted" style={{ padding: 24 }}>{t('No customers yet. Share your link to start.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('You see invoices and tax data only for customers whose manager allowed it.')}</p>
    </div>
  );
}

function Leads({ p }) {
  const { t, locale } = useLang();
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', note: '' });
  const [msg, setMsg] = useState(null);
  const leads = getLeads().filter((l) => l.partnerId === p.id);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = (invite) => {
    const chk = f.email && partnerRegisterCheck(f.email);
    if (chk?.registered) { setMsg({ warn: true, key: 'This company is already registered with Model. It cannot be attributed to you.' }); return; }
    const l = createLead({ ...f, source: 'Partner', partnerId: p.id });
    if (invite && l.email) sendInvite(l.id);
    setMsg({ key: invite ? 'Lead {id} created and an invitation was emailed with your code.' : 'Lead {id} created. Our sales team will follow up.', vars: { id: l.id } });
    setF({ name: '', company: '', email: '', phone: '', note: '' });
  };
  return (
    <>
      <div className="card">
        <h3>{t('Add a lead or register a customer')}</h3>
        {msg && <div className={`alert ${msg.warn ? 'warn' : 'success'} mb-2`}>{msg.warn ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {t(msg.key, msg.vars)}</div>}
        <div className="form-grid">
          <div className="field"><label>{t('Contact name')}</label><input className="input" value={f.name} onChange={set('name')} /></div>
          <div className="field"><label>{t('Company')}</label><input className="input" value={f.company} onChange={set('company')} /></div>
          <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label>{t('Mobile')}</label><input className="input" dir="ltr" value={f.phone} onChange={set('phone')} /></div>
          <div className="field full"><label>{t('Note')}</label><input className="input" value={f.note} onChange={set('note')} /></div>
        </div>
        <div className="flex gap-1 mt-2"><button className="btn btn-outline" disabled={!f.name && !f.company} onClick={() => add(false)}><UserPlus size={15} /> {t('Add lead')}</button><button className="btn btn-primary" disabled={!f.email} onClick={() => add(true)}><Send size={15} /> {t('Send registration invitation')}</button></div>
      </div>
      <div className="card mt-2">
        <h3>{t('Your leads')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Company')}</th><th>{t('Created')}</th><th>{t('Stage')}</th><th>{t('Invitation')}</th></tr></thead>
          <tbody>{leads.map((l) => <tr key={l.id}><td><b>{l.company || l.name}</b></td><td>{fmtDate(l.createdAt, locale)}</td><td>{t(l.stage)}</td><td>{l.invite ? t(l.invite.status) : '—'}</td></tr>)}{!leads.length && <tr><td colSpan="4" className="muted center">{t('None yet.')}</td></tr>}</tbody></table></div>
      </div>
    </>
  );
}

function Commissions({ p }) {
  const { t, locale } = useLang();
  const [note, setNote] = useState({});
  const [inv, setInv] = useState({});
  const [err, setErr] = useState('');
  const cms = commissionsOf(p.id);
  const sts = getStatements().filter((s) => s.partnerId === p.id);
  const act = (fn) => { try { setErr(''); fn(); } catch (e) { setErr(e); } };
  return (
    <>
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      <div className="card">
        <h3>{t('Statements')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Statement')}</th><th>{t('Period')}</th><th>{t('Total')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>{sts.map((s) => (
            <tr key={s.id}><td dir="ltr"><b>{s.id}</b></td><td>{s.period}</td><td dir="ltr"><b>{formatMoney(s.total)}</b></td><td><span className="badge blue">{t(s.status)}</span>{s.payout && <small className="muted" style={{ display: 'block' }}>{t('Paid {date} · {ref}', { date: fmtDate(s.payout.at, locale), ref: s.payout.ref })}</small>}</td>
              <td>{s.status === 'Sent to partner' && <div className="flex gap-1 wrap"><button className="btn btn-outline btn-sm" onClick={() => act(() => confirmStatement(s.id))}><CheckCircle2 size={14} /> {t('Confirm')}</button><input className="input input-sm" style={{ maxWidth: 200 }} placeholder={t('What is wrong?')} value={note[s.id] || ''} onChange={(e) => setNote({ ...note, [s.id]: e.target.value })} /><button className="btn btn-outline btn-sm" onClick={() => act(() => objectStatement(s.id, note[s.id]))}>{t('Object')}</button></div>}
                {s.status === 'Approved' && <div className="flex gap-1"><input className="input input-sm" dir="ltr" style={{ maxWidth: 150 }} placeholder={t('Your invoice no.')} value={inv[s.id] || ''} onChange={(e) => setInv({ ...inv, [s.id]: e.target.value })} /><label className="btn btn-primary btn-sm"><Upload size={14} /> {t('Upload invoice')}<input type="file" hidden onChange={(e) => act(() => attachPartnerInvoice(s.id, { number: inv[s.id] || 'INV', amount: s.total, fileName: e.target.files[0]?.name }))} /></label></div>}</td></tr>
          ))}{!sts.length && <tr><td colSpan="5" className="muted center">{t('No statements yet.')}</td></tr>}</tbody></table></div>
        <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Payment is made by bank transfer after the statement is approved and your invoice matches the total.')}</p>
      </div>
      <div className="card mt-2">
        <h3>{t('Commissions')}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t('Customer')}</th><th>{t('Type')}</th><th>{t('Base')}</th><th>{t('Rate')}</th><th>{t('Amount')}</th><th>{t('Held until')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>{cms.map((c) => <tr key={c.id}><td>{c.company}</td><td>{t(c.type)}</td><td dir="ltr">{formatMoney(c.base)}</td><td>{c.rate}%</td><td dir="ltr"><b>{formatMoney(c.amount)}</b></td><td>{fmtDate(c.holdUntil, locale)}</td><td>{t(c.status)}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}

function BankCompany({ p }) {
  const { t } = useLang();
  const [b, setB] = useState(p.bank || { bankName: '', accountName: p.name, iban: '' });
  const [otp, setOtp] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const start = () => { setOk(false); setErr(''); setOtp(sendOtp({ to: p.email, channel: 'Email', purpose: 'bank' })); };
  const confirm = () => { try { saveBank(p.id, b, code, otp.demoCode); setOtp(null); setOk(true); } catch (e) { setErr(e); } };
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>{t('Bank account for commission payouts')}</h3>
      {ok && <div className="alert success mb-2"><CheckCircle2 size={16} /> {t('Bank account verified and saved.')}</div>}
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      <div className="form-grid">
        <div className="field"><label>{t('Bank')}</label><input className="input" value={b.bankName} onChange={(e) => setB({ ...b, bankName: e.target.value })} /></div>
        <div className="field"><label>{t('Account name')}</label><input className="input" value={b.accountName} onChange={(e) => setB({ ...b, accountName: e.target.value })} /></div>
        <div className="field full"><label>IBAN</label><input className="input" dir="ltr" value={b.iban} onChange={(e) => setB({ ...b, iban: e.target.value })} placeholder="AE07 0331 2345 6789 0123 456" /></div>
      </div>
      {!otp ? <button className="btn btn-primary mt-2" onClick={start}><ShieldCheck size={15} /> {t('Verify and save')}</button> : (
        <div className="card-soft mt-2"><b>{t('Enter the code sent to {email}', { email: p.email })}</b><div className="demo-code mt-1">{t('Demo: your code is {code}', { code: otp.demoCode })}</div><div className="flex gap-1 mt-1"><input className="input otp-input" dir="ltr" maxLength="6" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn btn-primary" onClick={confirm}>{t('Confirm')}</button></div></div>
      )}
      <h3 className="mt-3">{t('Company')}</h3>
      <div className="kv-grid"><div><span>{t('Name')}</span><b>{p.name}</b></div><div><span>{t('Trade licence')}</span><b dir="ltr">{p.tradeLicense || '—'}</b></div><div><span>{t('TRN')}</span><b dir="ltr">{p.trn || '—'}</b></div><div><span>{t('Agreement')}</span><b>v{p.agreement?.version}</b></div></div>
    </div>
  );
}

function PartnerUsers({ p, me }) {
  const { t } = useLang();
  const [f, setF] = useState({ name: '', email: '', role: 'User' });
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const add = async () => { setErr(''); try { setPw(await addPartnerUser(p.id, f)); setF({ name: '', email: '', role: 'User' }); } catch (e) { setErr(e); } };
  return (
    <div className="card">
      <h3>{t('Users')}</h3>
      {err && <div className="alert error mb-2">{errText(t, err)}</div>}
      {pw && <div className="alert success mb-2"><KeyRound size={16} /> {t('User added. Temporary password: {pw}', { pw })}</div>}
      <div className="table-wrap"><table><thead><tr><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th /></tr></thead>
        <tbody>{p.users.map((u) => <tr key={u.id}><td>{u.name}</td><td dir="ltr">{u.email}</td><td>{t(u.role)}</td><td>{t(u.status)}</td><td>{u.id !== me.id && <button className="btn btn-outline btn-sm" onClick={() => setPartnerUserStatus(p.id, u.id, u.status === 'Active' ? 'Inactive' : 'Active')}>{t(u.status === 'Active' ? 'Deactivate' : 'Activate')}</button>}</td></tr>)}</tbody></table></div>
      <div className="form-grid mt-2">
        <div className="field"><label>{t('Name')}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>{t('Email')}</label><input className="input" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>{t('Role')}</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>User</option><option>Account manager</option></select></div>
        <button className="btn btn-primary" onClick={add}><UserPlus size={15} /> {t('Add user')}</button>
      </div>
      <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Two-step sign-in is mandatory for every partner user.')}</p>
    </div>
  );
}
