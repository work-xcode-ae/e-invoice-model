// Customer journey (REG-06..REG-12, BR-06, BR-20, section 2.4):
// Awaiting payment → Awaiting documents → Under review → Awaiting linking → Active → Suspended → Disconnected.
// Screens, notifications and tasks follow the stage.
import { getUserById, updateUser, fail, delay, getUsers } from './api';
import { getPackage } from '../data/packages';
import { getPlatform } from './platform';
import { addAudit } from './audit';
import { addLog } from './logs';
import { createTask, completeTasksFor } from './tasks';
import { sendTemplate } from './messaging';
import { newLedger, withLegacy } from './usage';
import { sendPendingEInvoices } from './modelDocs';

export const STAGES = ['Awaiting payment', 'Awaiting documents', 'Under review', 'Awaiting linking', 'Active', 'Suspended', 'Disconnected'];
export const STAGE_BADGE = { 'Awaiting payment': 'gray', 'Awaiting documents': 'orange', 'Under review': 'blue', 'Awaiting linking': 'purple', Active: 'green', Suspended: 'red', Disconnected: 'gray' };

const iso = (d = new Date()) => new Date(d).toISOString();
const who = () => { try { const s = JSON.parse(localStorage.getItem('mei_session')); return s?.member?.name || s?.user?.fullName || 'System'; } catch { return 'System'; } };

/** Stage of a customer account (old demo accounts without one are treated as active). */
export const stageOf = (u) => u?.stage || (u?.subscription ? 'Active' : 'Awaiting payment');
export const isActive = (u) => stageOf(u) === 'Active';

/** What the customer should do next, for the dashboard (REG-09). */
export function nextStep(u) {
  switch (stageOf(u)) {
    case 'Awaiting payment': return { key: 'Choose a package and pay to submit your application.', action: 'packages' };
    case 'Awaiting documents': return { key: 'Upload your documents so our team can review them.', action: 'journey' };
    case 'Under review': return { key: 'Our team is reviewing your documents. We will contact you if anything is missing.', action: 'journey' };
    case 'Awaiting linking': return { key: 'Authorise Model in EmaraTax, then confirm here so we can retrieve your Peppol ID.', action: 'journey' };
    case 'Active': return { key: 'Your account is active. Open the billing portal to issue invoices.', action: 'portal' };
    case 'Suspended': return { key: 'Your account is suspended for non-payment. Pay the open invoice to resume at once.', action: 'plan' };
    case 'Disconnected': return { key: 'Your account is disconnected. Your archive is available until {date}.', vars: { date: u.archiveUntil }, dateVar: 'date', action: null };
    default: return null;
  }
}

export function setStage(userId, stage, note = '') {
  const u = getUserById(userId);
  if (!u) throw fail('User not found.');
  const from = stageOf(u);
  if (from === stage) return u;
  const updated = updateUser(userId, (x) => ({ stage, stageHistory: [...(x.stageHistory || []), { from, to: stage, at: iso(), by: who(), note }] }));
  addAudit({ area: 'Customers', action: 'Stage changed', entity: u.company?.name || u.email, before: from, after: stage });
  addLog({ type: 'activity', userId, company: u.company?.name, action: 'Stage changed', details: '{from} → {to}', vars: { from, to: stage } });
  return updated;
}

const refOf = (u) => ({ kind: 'company', id: u.id, name: u.company?.name || u.fullName });

/** Called once payment succeeds (REG-05/REG-06): the application is submitted and Customer Service gets a task. */
export function onPaid(userId) {
  const u = getUserById(userId);
  if (!u) return;
  if (['Awaiting payment', undefined].includes(u.stage) || !u.stage) {
    setStage(userId, 'Awaiting documents', 'Payment received');
    createTask({ type: 'docs-review', ref: refOf(u), note: 'New customer paid. First contact within the deadline.' });
    sendTemplate('welcome', { userId }, { name: u.fullName.split(' ')[0] }, { level: 'success', link: 'journey' });
  }
}

// ---------- Documents (REG-06) ----------
export const requiredDocs = (u) => getPlatform().registration.requiredDocs.map((d) => ({ ...d, required: d.id === 'vat' ? u?.company?.vatRegistered !== false && !!u?.company?.trn : d.required }));

export async function uploadDocument(userId, docId, fileName) {
  await delay(400);
  const def = getPlatform().registration.requiredDocs.find((d) => d.id === docId);
  updateUser(userId, (u) => {
    const docs = (u.documents || []).filter((d) => d.id !== docId);
    return { documents: [...docs, { id: docId, label: def?.label || docId, fileName, uploadedAt: iso(), status: 'Uploaded', by: who() }] };
  });
  const u = getUserById(userId);
  const req = requiredDocs(u).filter((d) => d.required);
  const allIn = req.every((d) => (u.documents || []).some((x) => x.id === d.id && x.status !== 'Missing'));
  if (allIn && stageOf(u) === 'Awaiting documents') {
    setStage(userId, 'Under review', 'All required documents uploaded');
    completeTasksFor(userId, ['docs-missing']);
    createTask({ type: 'docs-review', ref: refOf(u), note: 'All required documents uploaded.' });
  }
  return getUserById(userId);
}

/** Customer Service: accept one document. */
export function acceptDocument(userId, docId) {
  updateUser(userId, (u) => ({ documents: (u.documents || []).map((d) => (d.id === docId ? { ...d, status: 'Accepted', reviewedAt: iso(), reviewedBy: who() } : d)) }));
}

/** Customer Service: a document is missing or unclear. There is no rejection: the gap is completed with the customer. */
export function requestDocument(userId, docId, note) {
  if (!note?.trim()) throw fail('Tell the customer what is missing.');
  const def = getPlatform().registration.requiredDocs.find((d) => d.id === docId);
  updateUser(userId, (u) => {
    const docs = (u.documents || []).filter((d) => d.id !== docId);
    const old = (u.documents || []).find((d) => d.id === docId);
    return { documents: [...docs, { ...(old || { id: docId, label: def?.label || docId }), status: 'Missing', note, reviewedAt: iso(), reviewedBy: who() }] };
  });
  const u = getUserById(userId);
  if (['Under review'].includes(stageOf(u))) setStage(userId, 'Awaiting documents', 'Document requested again');
  sendTemplate('missingDocs', { userId }, { doc: def?.label || docId, note }, { level: 'warning', link: 'journey' });
  createTask({ type: 'docs-missing', ref: refOf(u), note: `${def?.label}: ${note}` });
}

/** Review complete → linking. */
export function completeReview(userId) {
  const u = getUserById(userId);
  const req = requiredDocs(u).filter((d) => d.required);
  const missing = req.filter((d) => !(u.documents || []).some((x) => x.id === d.id && x.status === 'Accepted'));
  if (missing.length) throw fail('Accept every required document first: {list}.', { list: missing.map((d) => d.label).join(', ') });
  setStage(userId, 'Awaiting linking', 'Documents complete');
  completeTasksFor(userId, ['docs-review', 'docs-missing']);
  createTask({ type: 'linking', ref: refOf(u) });
  return getUserById(userId);
}

// ---------- Linking through EmaraTax and Peppol ID (REG-07) ----------
/** Customer: "I have authorised Model in EmaraTax". The Peppol ID is then retrieved automatically. */
export async function confirmAuthorisation(userId) {
  updateUser(userId, (u) => ({ linking: { ...(u.linking || {}), status: 'Authorisation sent', authorisedAt: iso() } }));
  return retrievePeppolId(userId);
}

/** Ask the technical partner for the customer's Peppol ID (simulated) and check it is registered. */
export async function retrievePeppolId(userId, { forceFail = false } = {}) {
  updateUser(userId, (u) => ({ linking: { ...(u.linking || {}), status: 'Retrieving', attempts: (u.linking?.attempts || 0) + 1 } }));
  await delay(1200);
  const u = getUserById(userId);
  const tin = u.company?.tin || (u.company?.trn ? u.company.trn.slice(0, 10) : '');
  const ok = !forceFail && /^\d{10}$/.test(tin) && Math.random() > 0.15;
  if (ok) {
    const peppolId = `0235:${tin}`;
    updateUser(userId, (x) => ({ linking: { ...(x.linking || {}), status: 'Linked', peppolId, tin, verifiedAt: iso(), smpRegistered: true, lastError: null } }));
    addLog({ type: 'activity', userId, company: u.company?.name, action: 'Peppol ID retrieved', details: '{id}', vars: { id: peppolId } });
    completeTasksFor(userId, ['peppol-failed']);
    return { ok: true, peppolId };
  }
  const error = !/^\d{10}$/.test(tin) ? 'The TIN on file is not 10 digits.' : 'Authorisation not found in EmaraTax yet (simulated).';
  updateUser(userId, (x) => ({ linking: { ...(x.linking || {}), status: 'Failed', lastError: error } }));
  createTask({ type: 'peppol-failed', ref: refOf(u), note: error });
  addLog({ type: 'error', userId, company: u.company?.name, action: 'Peppol ID retrieval failed', details: error });
  return { ok: false, error };
}

/** Customer Service: activate. The subscription year starts today, not on the payment date (BR-06). */
export function activate(userId) {
  const u = getUserById(userId);
  if (u.linking?.status !== 'Linked') throw fail('Retrieve and verify the Peppol ID before activation.');
  if (!u.subscription) throw fail('There is no paid subscription.');
  const pkg = getPackage(u.subscription.packageId);
  const now = new Date();
  const ledger = newLedger(u.subscription.customQuota ?? pkg, now);
  const annual = Number(u.subscription.months) === 12;
  const monthly = Number(u.subscription.priceMonthly ?? pkg.price);
  const sub = withLegacy({
    ...u.subscription,
    status: 'Active', activatedAt: iso(now), startDate: iso(now),
    endDate: annual ? ledger.yearEnd : ledger.periodEnd,
    ledger,
    // First month prorated: the unused part of the first month's fee is credited on the first renewal invoice.
    prorationCredit: annual || ledger.firstPeriodShare >= 1 ? 0 : +(monthly * (1 - ledger.firstPeriodShare)).toFixed(2),
  });
  updateUser(userId, { subscription: sub });
  setStage(userId, 'Active', 'Activated');
  completeTasksFor(userId, ['linking', 'peppol-failed', 'docs-review']);
  sendPendingEInvoices(userId);
  sendTemplate('activation', { userId }, { date: now.toLocaleDateString('en-GB') }, { level: 'success', link: 'portal' });
  return getUserById(userId);
}

export function suspend(userId, note = 'Not paid after the grace period') {
  updateUser(userId, (u) => ({ subscription: { ...u.subscription, status: 'Suspended' } }));
  setStage(userId, 'Suspended', note);
  sendTemplate('suspension', { userId }, {}, { level: 'danger', link: 'plan' });
}
export function resume(userId, note = 'Payment received') {
  updateUser(userId, (u) => ({ subscription: { ...u.subscription, status: 'Active', graceUntil: null } }));
  setStage(userId, 'Active', note);
}

// ---------- Re-verify, unlink, move provider (REG-10, BR-20) ----------
export async function requestService(userId, { kind, newProvider = '', note = '' }) {
  await delay(300);
  const req = { id: `SR-${Date.now().toString(36).toUpperCase()}`, kind, newProvider, note, status: 'Requested', requestedAt: iso(), by: who(), steps: [{ at: iso(), action: 'Requested', by: who() }] };
  updateUser(userId, (u) => ({ serviceRequests: [req, ...(u.serviceRequests || [])] }));
  const u = getUserById(userId);
  createTask({ type: 'disconnect', ref: { ...refOf(u), id: `${userId}:${req.id}`, userId }, note: `${kind}${newProvider ? ` → ${newProvider}` : ''}` });
  return req;
}

const stepReq = (userId, reqId, patch, action) => updateUser(userId, (u) => ({
  serviceRequests: (u.serviceRequests || []).map((r) => (r.id === reqId ? { ...r, ...patch, steps: [...r.steps, { at: iso(), action, by: who() }] } : r)),
}));

/** Customer Service prepares the request; unlinking and moving need the manager's approval (section 4.1). */
export function submitForApproval(userId, reqId) { stepReq(userId, reqId, { status: 'Awaiting approval' }, 'Sent for manager approval'); }

/** Executes at once, never held back for unpaid amounts. Every step is logged. */
export async function executeService(userId, reqId) {
  const u = getUserById(userId);
  const req = (u.serviceRequests || []).find((r) => r.id === reqId);
  if (!req) throw fail('Request not found.');
  if (req.kind === 'Re-verify') {
    stepReq(userId, reqId, { status: 'In progress' }, 'Re-verification started');
    const res = await retrievePeppolId(userId);
    stepReq(userId, reqId, { status: res.ok ? 'Done' : 'Failed', doneAt: iso() }, res.ok ? 'Peppol ID verified' : 'Verification failed');
  } else {
    stepReq(userId, reqId, { status: 'In progress' }, 'Deregistration from SMP requested');
    await delay(800);
    const archiveDays = getPlatform().durations.archiveDays;
    const until = new Date(Date.now() + archiveDays * 86400000);
    updateUser(userId, (x) => ({
      linking: { ...(x.linking || {}), status: 'Unlinked', smpRegistered: false, unlinkedAt: iso(), movedTo: req.newProvider || null },
      subscription: x.subscription ? { ...x.subscription, autoRenew: false, status: 'Ended' } : x.subscription,
      archiveUntil: iso(until),
    }));
    stepReq(userId, reqId, { status: 'Done', doneAt: iso() }, req.kind === 'Move provider' ? 'Moved to {provider}. Removed from SMP.' : 'Unlinked. Removed from SMP.');
    setStage(userId, 'Disconnected', req.kind);
  }
  completeTasksFor(`${userId}:${reqId}`);
  addAudit({ area: 'Customers', action: `${req.kind} executed`, entity: u.company?.name || u.email, before: { stage: stageOf(u) }, after: { stage: stageOf(getUserById(userId)) } });
  return getUserById(userId);
}

// ---------- Consulting services (BIL-12) ----------
export function consultingBalance(u) {
  const pkg = getPackage(u?.subscription?.packageId);
  const yearStart = u?.subscription?.ledger?.yearStart || u?.subscription?.startDate || '';
  const used = (u?.consulting || []).filter((r) => r.requestedAt >= yearStart && r.status !== 'Cancelled').reduce((s, r) => s + (r.coveredHours || 0), 0);
  const total = pkg?.consultingHours || 0;
  return { total, used, left: Math.max(0, total - used), discount: pkg?.consultingDiscount || 0 };
}

export async function requestConsulting(userId, serviceId, note = '') {
  await delay(300);
  const u = getUserById(userId);
  const svc = getPlatform().consulting.find((s) => s.id === serviceId);
  if (!svc) throw fail('Choose a service.');
  const bal = consultingBalance(u);
  const covered = Math.min(bal.left, svc.hours);
  const paidShare = (svc.hours - covered) / svc.hours;
  const final = +(svc.price * paidShare * (1 - bal.discount / 100)).toFixed(2);
  const req = { id: `CR-${Date.now().toString(36).toUpperCase()}`, serviceId, name: svc.name, hours: svc.hours, price: svc.price, coveredHours: covered, discountPct: bal.discount, final, note, status: 'Requested', requestedAt: iso(), by: who() };
  updateUser(userId, (x) => ({ consulting: [req, ...(x.consulting || [])] }));
  createTask({ type: 'consulting-request', ref: { ...refOf(u), id: `${userId}:${req.id}` }, note: `${svc.name} · ${svc.hours} h` });
  return req;
}

export function setConsultingStatus(userId, reqId, status) {
  updateUser(userId, (u) => ({ consulting: (u.consulting || []).map((r) => (r.id === reqId ? { ...r, status, [`${status.toLowerCase()}At`]: iso() } : r)) }));
  if (status === 'Completed') completeTasksFor(`${userId}:${reqId}`);
}

// ---------- Terms acceptance by version (REG-04) ----------
const latest = (key) => {
  const p = getPlatform().policies[key];
  const today = new Date().toISOString().slice(0, 10);
  const live = p.versions.filter((v) => v.effectiveDate <= today);
  return live[live.length - 1] || p.versions[0];
};

/** Policies the signed-in person still has to accept (a new version asks again at sign-in). */
export function pendingPolicies(u, actorId) {
  if (!u) return [];
  return ['terms', 'disclaimer'].filter((k) => !(u.acceptances || []).some((a) => a.doc === k && a.version === latest(k).version && a.actorId === actorId))
    .map((k) => ({ key: k, version: latest(k).version, title: getPlatform().policies[k].title, titleAr: getPlatform().policies[k].titleAr }));
}

export function acceptPolicies(userId, actor, keys) {
  const at = iso();
  updateUser(userId, (u) => ({ acceptances: [...(u.acceptances || []), ...keys.map((k) => ({ doc: k, version: latest(k).version, at, actorId: actor.id, actorName: actor.name }))] }));
  addAudit({ area: 'Customers', action: 'Terms accepted', entity: actor.name, before: null, after: keys.map((k) => `${k} v${latest(k).version}`) });
}

// ---------- Licence expiry (NTF-02) ----------
export function checkLicenceExpiry() {
  const soon = Date.now() + 30 * 86400000;
  getUsers().forEach((u) => {
    const exp = u.company?.licenceExpiry;
    if (!exp || u.role === 'SuperAdmin') return;
    const t = new Date(exp).getTime();
    if (t < soon) {
      sendTemplate('licenceExpiry', { userId: u.id }, { date: exp, dedupe: `lic-${exp}` }, { level: 'warning', link: 'company' });
      createTask({ type: 'licence-expiry', ref: { kind: 'company', id: `${u.id}:lic`, name: u.company?.name } });
    }
  });
}
