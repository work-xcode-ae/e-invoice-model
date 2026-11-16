// Partner programme (PRT-01..PRT-08, BR-14..BR-17).
// Apply → manager review → plan assigned → agreement accepted (by version) → active with a referral code.
// One partner per customer; referral links last 90 days; no retroactive commission.
// Commission: on subscription, renewal and upgrade, after discount and without VAT; setup fee and overage only
// when the plan says so; held until the customer is active and 14 days have passed; cancelled by a refund in
// that window, reversed (negative balance carried) by an exceptional refund after it.
import { read, write, fail, delay, getUsers, getUserById, updateUser } from './api';
import { getPlatform } from './platform';
import { addAudit } from './audit';
import { createTask, completeTasksFor } from './tasks';
import { sendRaw } from './messaging';
import { formatMoney } from '../data/packages';

const P_KEY = 'mei_partners';
const C_KEY = 'mei_commissions';
const S_KEY = 'mei_statements';
const REF_KEY = 'mei_ref'; // referral captured from a link, in the visitor's browser
const iso = (d = new Date()) => new Date(d).toISOString();
const who = () => { try { const s = JSON.parse(localStorage.getItem('mei_session')); return s?.partnerUser?.name || s?.user?.fullName || 'System'; } catch { return 'System'; } };

export const PARTNER_STATUSES = ['Applied', 'Under review', 'Plan assigned', 'Active', 'Suspended', 'Rejected'];

export const getPartners = () => read(P_KEY, []);
export const getPartner = (id) => getPartners().find((p) => p.id === id) || null;
export const partnerByCode = (code) => getPartners().find((p) => p.code && p.code.toLowerCase() === String(code || '').trim().toLowerCase() && p.status === 'Active') || null;
const savePartners = (list) => write(P_KEY, list);
const patchPartner = (id, fn) => {
  const list = getPartners();
  const p = list.find((x) => x.id === id);
  if (!p) throw fail('Partner not found.');
  const next = fn(p);
  savePartners(list.map((x) => (x.id === id ? next : x)));
  return next;
};

// ---------- Onboarding (PRT-02) ----------
export async function applyAsPartner(form) {
  await delay(600);
  if (!form.company || !form.contactName || !/^\S+@\S+\.\S+$/.test(form.email || '')) throw fail('Fill in the company, contact name and a valid email.');
  if (getPartners().some((p) => p.email.toLowerCase() === form.email.toLowerCase())) throw fail('An application with this email already exists.');
  const p = {
    id: `PT-${String(getPartners().length + 101)}`,
    name: form.company, type: form.type || 'Referral', contactName: form.contactName, email: form.email.toLowerCase(), phone: form.phone || '',
    tradeLicense: form.tradeLicense || '', trn: form.trn || '', website: form.website || '', emirate: form.emirate || '', message: form.message || '',
    docs: (form.docs || []).map((name) => ({ name, at: iso() })),
    status: 'Applied', plan: null, agreement: null, code: null, bank: null,
    users: [{ id: `pu-${Date.now().toString(36)}`, name: form.contactName, email: form.email.toLowerCase(), password: form.password || 'Demo@2026', role: 'Account manager', status: 'Active' }],
    createdAt: iso(), history: [{ at: iso(), action: 'Application received', by: form.contactName }],
  };
  savePartners([p, ...getPartners()]);
  createTask({ type: 'partner-application', ref: { kind: 'partner', id: p.id, name: p.name } });
  return p;
}

export function startReview(id) { return patchPartner(id, (p) => ({ ...p, status: 'Under review', history: [...p.history, { at: iso(), action: 'Review started', by: who() }] })); }

export function rejectPartner(id, note) {
  if (!note?.trim()) throw fail('Give a reason.');
  completeTasksFor(id, ['partner-application']);
  return patchPartner(id, (p) => ({ ...p, status: 'Rejected', history: [...p.history, { at: iso(), action: 'Rejected', note, by: who() }] }));
}

/** Manager assigns a commission plan (copied from a template, editable). Changes apply to new payments only. */
export function assignPlan(id, plan) {
  const before = getPartner(id)?.plan;
  const p = patchPartner(id, (x) => ({ ...x, plan: { ...plan, since: iso() }, planHistory: [...(x.planHistory || []), ...(x.plan ? [x.plan] : [])], status: x.status === 'Active' ? 'Active' : 'Plan assigned', history: [...x.history, { at: iso(), action: before ? 'Plan changed (applies to new payments only)' : 'Plan assigned', by: who() }] }));
  addAudit({ area: 'Partners', action: before ? 'Commission plan changed' : 'Commission plan assigned', entity: p.name, before, after: plan });
  completeTasksFor(id, ['partner-application']);
  return p;
}

/** Partner accepts the agreement (by version). Only then is a referral code issued. */
export function acceptAgreement(id, actorName) {
  const ag = getPlatform().policies.partnerAgreement;
  const version = ag.versions[ag.versions.length - 1].version;
  const p0 = getPartner(id);
  if (!p0.plan) throw fail('A commission plan must be assigned first.');
  const code = p0.code || `${p0.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'PART'}${Math.floor(100 + Math.random() * 900)}`;
  const p = patchPartner(id, (x) => ({ ...x, agreement: { version, at: iso(), by: actorName }, status: 'Active', code, activatedAt: iso(), history: [...x.history, { at: iso(), action: 'Agreement v{v} accepted · activated', vars: { v: version }, by: actorName }] }));
  addAudit({ area: 'Partners', action: 'Partnership agreement accepted', entity: p.name, before: null, after: { version, code } });
  return p;
}

export const setPartnerStatus = (id, status) => patchPartner(id, (p) => ({ ...p, status, history: [...p.history, { at: iso(), action: `Status: ${status}`, by: who() }] }));

export async function addPartnerUser(id, { name, email, role }) {
  await delay(300);
  const em = String(email || '').trim().toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(em)) throw fail('Enter a name and a valid email.');
  if (getPartners().some((p) => p.users.some((u) => u.email === em))) throw fail('A user with this email already exists.');
  const tempPassword = `Prt-${Math.random().toString(36).slice(2, 7)}`;
  patchPartner(id, (p) => ({ ...p, users: [...p.users, { id: `pu-${Date.now().toString(36)}`, name, email: em, password: tempPassword, role: role || 'User', status: 'Active' }] }));
  return tempPassword;
}
export const setPartnerUserStatus = (id, uid, status) => patchPartner(id, (p) => ({ ...p, users: p.users.map((u) => (u.id === uid ? { ...u, status } : u)) }));

/** Bank account change needs a verification code (sent to the account manager). */
export function saveBank(id, bank, code, expected) {
  if (!/^AE\d{21}$/.test(String(bank.iban || '').replace(/\s/g, ''))) throw fail('IBAN must be AE followed by 21 digits.');
  if (String(code) !== String(expected)) throw fail('The verification code is not correct.');
  const before = getPartner(id)?.bank;
  const p = patchPartner(id, (x) => ({ ...x, bank: { ...bank, iban: bank.iban.replace(/\s/g, ''), verified: true, at: iso() } }));
  addAudit({ area: 'Partners', action: 'Partner bank account changed', entity: p.name, before, after: { ...p.bank, iban: `…${p.bank.iban.slice(-4)}` } });
  return p;
}
export const savePartnerProfile = (id, patch) => patchPartner(id, (p) => ({ ...p, ...patch }));

// ---------- Attribution (PRT-04, BR-14) ----------
/** A visitor arrived with ?ref=CODE: remember it for 90 days in this browser. */
export function captureReferral(code) {
  const p = partnerByCode(code);
  if (!p) return null;
  const days = getPlatform().durations.referralDays;
  write(REF_KEY, { code: p.code, partnerId: p.id, at: iso(), expires: iso(Date.now() + days * 86400000) });
  return p;
}
export function activeReferral() {
  const r = read(REF_KEY, null);
  if (!r || new Date(r.expires) < new Date()) return null;
  return r;
}

/** Attach a customer to a partner. One partner per customer: an existing link is never replaced except by the manager. */
export function attributeCustomer(userId, partnerId, method, { force = false } = {}) {
  const u = getUserById(userId);
  if (!u) throw fail('User not found.');
  if (u.partner && !force) return { ok: false, existing: u.partner };
  const before = u.partner || null;
  updateUser(userId, { partner: { partnerId, method, at: iso(), by: who() } });
  addAudit({ area: 'Partners', action: force ? 'Customer moved to another partner' : 'Customer attributed to partner', entity: u.company?.name || u.email, before, after: { partnerId, method } });
  return { ok: true };
}

export const customersOf = (partnerId) => getUsers().filter((u) => u.partner?.partnerId === partnerId);

/** Partner registers a customer from the portal. An already registered customer only raises an alert. */
export function partnerRegisterCheck(email) {
  const u = getUsers().find((x) => x.email.toLowerCase() === String(email).toLowerCase());
  if (!u) return null;
  return { registered: true, hasPartner: !!u.partner };
}

// ---------- Commissions (PRT-05, BR-15..BR-17) ----------
export const getCommissions = () => read(C_KEY, []);
const saveCommissions = (list) => write(C_KEY, list);

/** Called after every customer payment. `lines` are the invoice lines (amounts excl. VAT). */
export function onPayment(userId, { invoiceId, type, lines, paidAt = iso() }) {
  const u = getUserById(userId);
  const link = u?.partner;
  if (!link) return null;
  const p = getPartner(link.partnerId);
  if (!p?.plan || p.status !== 'Active') return null;
  // No retroactive commission: payments before the attribution date earn nothing.
  if (new Date(paidAt) < new Date(link.at)) return null;
  const plan = p.plan;
  if (plan.months && new Date(paidAt) > new Date(new Date(link.at).setMonth(new Date(link.at).getMonth() + Number(plan.months)))) return null;
  const rate = type === 'New' ? plan.newRate : type === 'Upgrade' ? plan.upgradeRate : plan.renewalRate;
  const base = +lines.reduce((s, l) => {
    if (l.kind === 'setup' && !plan.includeSetup) return s;
    if (l.kind === 'overage' && !plan.includeOverage) return s;
    return s + Number(l.amount || 0); // discount lines are negative: commission is after the discount (BR-18)
  }, 0).toFixed(2);
  if (base <= 0 || !rate) return null;
  const hold = Number(plan.holdDays ?? getPlatform().durations.commissionHoldDays);
  const c = {
    id: `CM-${String(getCommissions().length + 1001)}`, partnerId: p.id, customerId: userId, company: u.company?.name || u.fullName,
    invoiceId, type, base, rate, amount: +(base * rate / 100).toFixed(2), planSnapshot: { ...plan },
    status: 'Held', paidAt, holdUntil: iso(new Date(paidAt).getTime() + hold * 86400000), createdAt: iso(),
  };
  saveCommissions([c, ...getCommissions()]);
  return c;
}

/** Held → Due once the customer is active and the hold period has passed (BR-16). */
export function releaseCommissions() {
  const list = getCommissions();
  let changed = false;
  const next = list.map((c) => {
    if (c.status !== 'Held') return c;
    const u = getUserById(c.customerId);
    if ((u?.stage || 'Active') === 'Active' && new Date(c.holdUntil) <= new Date()) { changed = true; return { ...c, status: 'Due', dueAt: iso() }; }
    return c;
  });
  if (changed) saveCommissions(next);
}

/** Refund: in the hold window the commission is cancelled; after it, it is reversed as a negative entry (BR-17). */
export function onRefund(userId, invoiceIds) {
  const list = getCommissions();
  const hit = list.filter((c) => c.customerId === userId && (!invoiceIds || invoiceIds.includes(c.invoiceId)) && !['Cancelled', 'Reversed'].includes(c.status) && c.amount > 0);
  if (!hit.length) return;
  const extra = [];
  const next = list.map((c) => {
    if (!hit.includes(c)) return c;
    if (c.status === 'Held') return { ...c, status: 'Cancelled', cancelledAt: iso(), note: 'Refund within the hold period' };
    extra.push({ ...c, id: `${c.id}-R`, amount: -c.amount, base: -c.base, status: 'Due', type: 'Reversal', note: `Reversal of ${c.id} after an exceptional refund`, createdAt: iso(), reversalOf: c.id });
    return { ...c, reversed: true };
  });
  saveCommissions([...extra, ...next]);
}

export const commissionsOf = (partnerId) => { releaseCommissions(); return getCommissions().filter((c) => c.partnerId === partnerId); };

export function partnerBalance(partnerId) {
  const list = commissionsOf(partnerId);
  const sum = (st) => +list.filter((c) => st.includes(c.status)).reduce((s, c) => s + c.amount, 0).toFixed(2);
  return { held: sum(['Held']), due: sum(['Due']), inStatement: sum(['In statement']), paid: sum(['Paid']) };
}

// ---------- Statements and payouts (PRT-06) ----------
export const getStatements = () => read(S_KEY, []);
const saveStatements = (list) => write(S_KEY, list);
const patchStatement = (id, fn) => {
  const list = getStatements();
  const s = list.find((x) => x.id === id);
  if (!s) throw fail('Statement not found.');
  const next = fn(s);
  saveStatements(list.map((x) => (x.id === id ? next : x)));
  return next;
};

/** Manager: build a statement from all Due commissions of a partner (negative balances are carried in). */
export function createStatement(partnerId, period) {
  releaseCommissions();
  const due = getCommissions().filter((c) => c.partnerId === partnerId && c.status === 'Due');
  if (!due.length) throw fail('There are no due commissions for this partner.');
  const total = +due.reduce((s, c) => s + c.amount, 0).toFixed(2);
  const p = getPartner(partnerId);
  const st = { id: `ST-${String(getStatements().length + 501)}`, partnerId, partnerName: p.name, period, commissionIds: due.map((c) => c.id), total, status: 'Sent to partner', createdAt: iso(), history: [{ at: iso(), action: 'Created and sent to partner', by: who() }] };
  saveStatements([st, ...getStatements()]);
  saveCommissions(getCommissions().map((c) => (st.commissionIds.includes(c.id) ? { ...c, status: 'In statement', statementId: st.id } : c)));
  const tpl = getPlatform().templates.commission;
  sendRaw({ to: { name: p.contactName, email: p.email }, subject: tpl.name, text: tpl.en.replace('{id}', st.id).replace('{period}', period).replace('{amount}', formatMoney(total)) });
  return st;
}

export function objectStatement(id, note) {
  if (!note?.trim()) throw fail('Explain the objection.');
  const st = patchStatement(id, (s) => ({ ...s, status: 'Objected', objection: note, history: [...s.history, { at: iso(), action: 'Partner objected', note, by: who() }] }));
  createTask({ type: 'partner-objection', ref: { kind: 'statement', id, name: `${id} · ${st.partnerName}` }, note });
  return st;
}
export function confirmStatement(id) { return patchStatement(id, (s) => ({ ...s, status: 'Confirmed by partner', history: [...s.history, { at: iso(), action: 'Confirmed by partner', by: who() }] })); }

export function approveStatement(id) {
  const st = patchStatement(id, (s) => ({ ...s, status: 'Approved', approvedAt: iso(), history: [...s.history, { at: iso(), action: 'Approved by manager', by: who() }] }));
  completeTasksFor(id);
  addAudit({ area: 'Partners', action: 'Commission statement approved', entity: id, before: null, after: { total: st.total } });
  return st;
}

/** Partner uploads its invoice (must match the total), or the manager issues a self-billing invoice. */
export function attachPartnerInvoice(id, { number, amount, fileName, selfBilling = false }) {
  const s0 = getStatements().find((x) => x.id === id);
  if (!['Approved'].includes(s0.status)) throw fail('The statement must be approved first.');
  if (!selfBilling && Math.abs(Number(amount) - s0.total) > 0.01) throw fail('The invoice amount ({amount}) must match the statement total ({total}).', { amount: formatMoney(amount), total: formatMoney(s0.total) });
  return patchStatement(id, (s) => ({ ...s, status: 'Invoice received', invoice: { number: selfBilling ? `SB-${s.id}` : number, amount: s.total, fileName, selfBilling, at: iso() }, history: [...s.history, { at: iso(), action: selfBilling ? 'Self-billing invoice issued' : 'Partner invoice received', by: who() }] }));
}

/** No payout without an approved statement and a matching invoice. */
export function payStatement(id, transferRef) {
  const s0 = getStatements().find((x) => x.id === id);
  if (s0.status !== 'Invoice received') throw fail('Pay only after the statement is approved and the invoice is received.');
  if (!transferRef?.trim()) throw fail('Enter the bank transfer reference.');
  const st = patchStatement(id, (s) => ({ ...s, status: 'Paid', payout: { ref: transferRef, at: iso() }, history: [...s.history, { at: iso(), action: 'Paid · {ref}', vars: { ref: transferRef }, by: who() }] }));
  saveCommissions(getCommissions().map((c) => (st.commissionIds.includes(c.id) ? { ...c, status: 'Paid', paidOutAt: iso() } : c)));
  addAudit({ area: 'Partners', action: 'Commission paid', entity: id, before: null, after: { total: st.total, ref: transferRef } });
  return st;
}

/** Partner consent for a customer: the partner sees the customer's invoices and tax data only with it. */
export const setPartnerConsent = (userId, on) => {
  updateUser(userId, { partnerConsent: !!on });
  addAudit({ area: 'Customers', action: on ? 'Partner access to invoices allowed' : 'Partner access to invoices withdrawn', entity: getUserById(userId)?.company?.name, before: !on, after: !!on });
};
