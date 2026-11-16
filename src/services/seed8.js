// v8 demo data (BRD v1.1): customer stages, usage ledgers, Model invoices, staff tasks, partners,
// commissions, leads, a pending bank transfer and a reconciliation month. Runs once per browser.
import { getUsers, saveUsers, read, write, DEMO_EMAIL } from './api';
import { getPackage } from '../data/packages';
import { newLedger, consume, withLegacy } from './usage';
import { issueInvoice, getModelDocs } from './modelDocs';
import { createTask, getTasks } from './tasks';
import { importPartnerInvoice } from './integration';
import { getPlatform } from './platform';

const iso = (d) => new Date(d).toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const endOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); };
const tinOf = (trn) => (trn || '').slice(0, 10);

const ALIAS = { standard: 'pro', platinum: 'premium' };
const termsVersion = () => getPlatform().policies.terms.versions.slice(-1)[0].version;
const discVersion = () => getPlatform().policies.disclaimer.versions.slice(-1)[0].version;
const acceptedBy = (at, name) => [
  { doc: 'terms', version: termsVersion(), at, actorId: 'owner', actorName: name },
  { doc: 'disclaimer', version: discVersion(), at, actorId: 'owner', actorName: name },
];

/** A ledger for a subscription that started `activatedDays` ago, with `usedThisMonth` documents this month. */
function seedLedger(pkg, activatedDays, usedThisMonth, carry = 0) {
  const activated = daysAgo(activatedDays);
  let l = newLedger(pkg, activated);
  if (activated < startOfMonth()) {
    l = { ...l, periodStart: iso(startOfMonth()), periodEnd: iso(endOfMonth()), monthQuota: Number(pkg.transactions), firstPeriodShare: 1, freeUsed: Math.min(l.freeTotal, 100), carry, sentTotal: 100 + Math.round(activatedDays / 30) * Number(pkg.transactions || 8) };
  }
  l = consume(l, usedThisMonth);
  l.lastSync = iso(new Date(Date.now() - 35 * 60000));
  return l;
}

function activeSub(pkgId, { activatedDays, used, carry = 0, months = 1, autoRenew = true }) {
  const pkg = getPackage(pkgId);
  const ledger = seedLedger(pkg, activatedDays, used, carry);
  return withLegacy({
    packageId: pkg.id, packageName: pkg.name, months, billing: months === 12 ? 'Annual' : 'Monthly',
    priceMonthly: pkg.price, priceAnnual: pkg.annualPrice, overagePrice: pkg.overagePrice, usersLimit: pkg.users, entities: pkg.entities,
    status: 'Active', paidAt: iso(daysAgo(activatedDays + 3)), activatedAt: ledger.yearStart, startDate: ledger.yearStart,
    endDate: months === 12 ? ledger.yearEnd : ledger.periodEnd, autoRenew, cancelAtPeriodEnd: !autoRenew, pendingChange: null, ledger, prorationCredit: 0,
  });
}

const companyExtras = (u, i) => ({
  ...u.company,
  tin: u.company?.tin || tinOf(u.company?.trn) || `10${String(40000000 + i * 1234567).slice(0, 8)}`,
  vatRegistered: !!u.company?.trn,
  licenceIssuer: u.company?.licenceIssuer || ['Dubai DET', 'Abu Dhabi DED', 'Sharjah SEDD', 'DMCC'][i % 4],
  licenceExpiry: u.company?.licenceExpiry || iso(new Date(Date.now() + (i === 2 ? 20 : 200 + i * 30) * 86400000)).slice(0, 10),
  activity: u.company?.activity || ['Trading', 'Services', 'Logistics', 'Technology', 'Healthcare'][i % 5],
  emaraTaxEmail: u.company?.emaraTaxEmail || u.email,
  sendingMethod: u.company?.sendingMethod || 'Billing portal (web)',
  volume: u.company?.volume || 'v3',
});

const linked = (u, at) => ({ status: 'Linked', peppolId: `0235:${u.company.tin}`, tin: u.company.tin, authorisedAt: at, verifiedAt: at, smpRegistered: true, attempts: 1 });
const docsAccepted = (at) => [
  { id: 'licence', label: 'Trade licence', fileName: 'trade-licence.pdf', uploadedAt: at, status: 'Accepted' },
  { id: 'eid', label: 'Emirates ID of the authorised person', fileName: 'emirates-id.pdf', uploadedAt: at, status: 'Accepted' },
  { id: 'vat', label: 'VAT registration certificate', fileName: 'vat-certificate.pdf', uploadedAt: at, status: 'Accepted' },
  { id: 'auth', label: 'Authorisation letter', fileName: 'authorisation-letter.pdf', uploadedAt: at, status: 'Accepted' },
];
const card = (last4, exp = '09/28', brand = 'Visa') => ({ token: `tok_${last4}seed`, brand, last4, exp, name: '', savedAt: iso(daysAgo(60)) });

const NEW_COMPANIES = [
  { id: 'seed-n-zahra', name: 'Zahra Dental Clinic', owner: 'Dr. Salma Yousef', email: 'salma@zahradental.ae', trn: '100666777800003', emirate: 'Abu Dhabi', pkg: 'basic', stage: 'Awaiting documents', paidDays: 1 },
  { id: 'seed-n-orbit', name: 'Orbit Software House', owner: 'Arjun Pillai', email: 'arjun@orbitsoft.ae', trn: '100777888900003', emirate: 'Dubai', pkg: 'pro', stage: 'Under review', paidDays: 2, months: 12, method: 'Bank transfer', partner: 'PT-102' },
  { id: 'seed-n-marina', name: 'Marina Yacht Services', owner: 'Omar Al Suwaidi', email: 'omar@marinayachts.ae', trn: '100888999000003', emirate: 'Ras Al Khaimah', pkg: 'basic', stage: 'Awaiting linking', paidDays: 6, linkFail: true },
  { id: 'seed-n-crescent', name: 'Crescent General Trading', owner: 'Hamad Al Ketbi', email: 'hamad@crescentgt.ae', trn: '100999000100003', emirate: 'Sharjah', pkg: null, stage: 'Awaiting payment', paidDays: null, order: 'premium' },
  { id: 'seed-n-saffron', name: 'Saffron Foodstuff', owner: 'Nadia Farouk', email: 'nadia@saffronfood.ae', trn: '100123123100003', emirate: 'Dubai', pkg: 'pro', stage: 'Active', activatedDays: 95, used: 120, pastDue: true },
  { id: 'seed-n-sahara', name: 'Sahara Cafe', owner: 'Karim Mansour', email: 'karim@saharacafe.ae', trn: '', emirate: 'Ajman', pkg: 'basic', stage: 'Suspended', activatedDays: 70, used: 30 },
  { id: 'seed-n-coastal', name: 'Coastal Builders', owner: 'Ian Fletcher', email: 'ian@coastalbuilders.ae', trn: '100321321300003', emirate: 'Fujairah', pkg: 'basic', stage: 'Disconnected', activatedDays: 120, used: 10 },
  { id: 'seed-n-micro', name: 'Micro Studio', owner: 'Hana Ito', email: 'hana@microstudio.ae', trn: '', emirate: 'Dubai', pkg: 'freemium', stage: 'Active', activatedDays: 200, used: 9, freemiumOver: true },
];

export function migrateV8() {
  const users = getUsers();
  const docQueue = []; // [{ userId, date, lines, status, method, kind }]

  // 1) Existing customers become Active with a usage ledger, documents, linking and a saved card.
  let i = 0;
  users.forEach((u) => {
    if (u.role === 'SuperAdmin') return;
    i += 1;
    if (u.company) u.company = companyExtras(u, i);
    if (u.subscription && !u.subscription.ledger && u.company) {
      const pkgId = ALIAS[u.subscription.packageId] || u.subscription.packageId;
      const pkg = getPackage(pkgId);
      const isDemo = u.email === DEMO_EMAIL;
      const activatedDays = isDemo ? 125 : 40 + i * 9;
      const used = isDemo ? 230 : u.id === 'seed-noor' ? Number(pkg.transactions) + 12 : Math.round(Number(pkg.transactions) * (0.3 + (i % 3) * 0.2));
      const keep = { locked: u.subscription.locked, lockedAt: u.subscription.lockedAt, apiDisabled: u.subscription.apiDisabled };
      const churned = !isDemo && new Date(u.subscription.endDate) < daysAgo(5);
      u.subscription = { ...activeSub(pkgId, { activatedDays, used, carry: isDemo ? 60 : 0 }), ...(keep.locked ? { ...keep, status: u.subscription.status } : {}), ...(churned ? { status: 'Cancelled', autoRenew: false, endedAt: u.subscription.endDate } : {}) };
      u.stage = churned ? 'Suspended' : 'Active';
      const at = iso(daysAgo(activatedDays + 2));
      u.stageHistory = [
        { from: null, to: 'Awaiting payment', at: iso(daysAgo(activatedDays + 4)), by: u.fullName, note: 'Account created' },
        { from: 'Awaiting payment', to: 'Awaiting documents', at: iso(daysAgo(activatedDays + 3)), by: 'System', note: 'Payment received' },
        { from: 'Awaiting documents', to: 'Under review', at, by: u.fullName, note: 'All required documents uploaded' },
        { from: 'Under review', to: 'Awaiting linking', at, by: 'Noura Al Hammadi', note: 'Documents complete' },
        { from: 'Awaiting linking', to: 'Active', at: u.subscription.activatedAt, by: 'Noura Al Hammadi', note: 'Activated' },
        ...(churned ? [{ from: 'Active', to: 'Suspended', at: u.subscription.endedAt, by: 'System', note: 'Subscription not renewed' }] : []),
      ];
      u.documents = docsAccepted(at);
      u.linkingPending = linked(u, u.subscription.activatedAt);
      u.card = card(isDemo ? '4242' : String(1000 + i * 37).slice(-4));
      u.acceptances = acceptedBy(at, u.fullName);
      u.setupPaid = ['annual'];
      // A paid invoice for the first payment and one per month since activation.
      const months = Math.min(5, Math.floor(activatedDays / 30));
      docQueue.push({ userId: u.id, date: daysAgo(activatedDays + 3), kind: 'Subscription', lines: [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: 'Monthly' } }, amount: Number(pkg.price), kind: 'package' }, ...(Number(pkg.setupFee) ? [{ desc: { key: 'Setup fee ({type})', vars: { type: pkg.setupFeeType } }, amount: Number(pkg.setupFee), kind: 'setup' }] : [])] });
      for (let m = months; m >= 1; m--) {
        const d = daysAgo(m * 30 - 2);
        const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        const over = u.id === 'seed-noor' && m === 1 ? 9 : 0;
        docQueue.push({ userId: u.id, date: d, kind: 'Renewal', lines: [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: label } }, amount: Number(pkg.price), kind: 'package' }, ...(over ? [{ desc: { key: 'Extra documents · {period}', vars: { period: label } }, qty: over, unitPrice: pkg.overagePrice, amount: over * pkg.overagePrice, kind: 'overage' }] : [])] });
      }
    }
    (u.teamUsers || []).forEach((m) => { if (m.role === 'Admin') m.role = 'Manager'; if (m.role === 'User') m.role = 'Accountant'; });
  });

  // 2) New companies in every stage.
  NEW_COMPANIES.forEach((c, k) => {
    if (users.some((u) => u.id === c.id)) return;
    const created = daysAgo((c.activatedDays || c.paidDays || 1) + 4);
    const u = {
      id: c.id, fullName: c.owner, email: c.email, phone: '+971 50 000 00' + (10 + k), password: 'Demo@2026', role: 'Owner', createdAt: iso(created),
      company: { name: c.name, legalName: `${c.name} L.L.C`, tradeLicense: `CN-${3000000 + k * 7919}`, trn: c.trn, emirate: c.emirate, street: `${c.emirate} Business Park, Office ${200 + k}`, city: c.emirate, country: 'AE' },
      teamUsers: [], payments: [], notifications: [], acceptances: acceptedBy(iso(created), c.owner),
    };
    u.company = companyExtras(u, 10 + k);
    u.stage = c.stage;
    u.stageHistory = [{ from: null, to: 'Awaiting payment', at: iso(created), by: c.owner, note: 'Account created' }];
    const pkg = c.pkg && getPackage(c.pkg);
    if (pkg && c.paidDays !== undefined && c.paidDays !== null) {
      const paid = daysAgo(c.paidDays);
      const months = c.months || 1;
      const end = new Date(paid); end.setMonth(end.getMonth() + months);
      u.subscription = withLegacy({ packageId: pkg.id, packageName: pkg.name, months, billing: months === 12 ? 'Annual' : 'Monthly', priceMonthly: pkg.price, priceAnnual: pkg.annualPrice, overagePrice: pkg.overagePrice, usersLimit: pkg.users, entities: pkg.entities, status: 'Pending activation', paidAt: iso(paid), startDate: iso(paid), endDate: iso(end), autoRenew: true, ledger: null, transactionsLimit: 0, transactionsUsed: 0 });
      u.stageHistory.push({ from: 'Awaiting payment', to: 'Awaiting documents', at: iso(paid), by: 'System', note: 'Payment received' });
      u.card = c.method === 'Bank transfer' ? null : card(String(5100 + k).slice(-4), '11/27', 'Mastercard');
      u.setupPaid = ['annual'];
      docQueue.push({ userId: u.id, date: paid, kind: 'Subscription', method: c.method || 'Card', lines: [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: months === 12 ? 'Annual' : 'Monthly' } }, amount: months === 12 ? pkg.annualPrice : pkg.price, kind: 'package' }, { desc: { key: 'Setup fee ({type})', vars: { type: pkg.setupFeeType } }, amount: pkg.setupFee, kind: 'setup' }] });
      u.payments.push({ id: `pi_${c.id}`, date: iso(paid), type: 'New', method: c.method || 'Card', description: { key: '{name} package · {months} month(s)', vars: { name: pkg.name, months } }, total: +(((months === 12 ? pkg.annualPrice : pkg.price) + pkg.setupFee) * 1.05).toFixed(2), status: 'Paid' });
    }
    if (c.stage === 'Awaiting documents') {
      u.documents = [{ id: 'licence', label: 'Trade licence', fileName: 'licence-2026.pdf', uploadedAt: iso(daysAgo(1)), status: 'Accepted' }, { id: 'eid', label: 'Emirates ID of the authorised person', fileName: 'eid-front.jpg', uploadedAt: iso(daysAgo(1)), status: 'Missing', note: 'Please upload both sides of the Emirates ID.' }];
    }
    if (c.stage === 'Under review') {
      u.documents = docsAccepted(iso(daysAgo(1))).map((d) => ({ ...d, status: 'Uploaded' }));
      u.stageHistory.push({ from: 'Awaiting documents', to: 'Under review', at: iso(daysAgo(1)), by: c.owner, note: 'All required documents uploaded' });
    }
    if (c.stage === 'Awaiting linking') {
      u.documents = docsAccepted(iso(daysAgo(4)));
      u.stageHistory.push({ from: 'Under review', to: 'Awaiting linking', at: iso(daysAgo(3)), by: 'Ahmed Fathy', note: 'Documents complete' });
      u.linking = { status: 'Failed', authorisedAt: iso(daysAgo(1)), attempts: 2, lastError: 'Authorisation not found in EmaraTax yet (simulated).' };
    }
    if (c.activatedDays) {
      u.subscription = activeSub(pkg.id, { activatedDays: c.activatedDays, used: c.used });
      u.documents = docsAccepted(iso(daysAgo(c.activatedDays + 1)));
      u.linkingPending = u.company.tin ? linked(u, u.subscription.activatedAt) : null;
      u.card = card(String(4000 + k * 11).slice(-4));
      u.setupPaid = ['annual'];
      u.stageHistory.push({ from: 'Awaiting linking', to: 'Active', at: u.subscription.activatedAt, by: 'Noura Al Hammadi', note: 'Activated' });
      docQueue.push({ userId: u.id, date: daysAgo(c.activatedDays + 2), kind: 'Subscription', lines: [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: 'Monthly' } }, amount: pkg.price, kind: 'package' }, ...(pkg.setupFee ? [{ desc: { key: 'Setup fee ({type})', vars: { type: pkg.setupFeeType } }, amount: pkg.setupFee, kind: 'setup' }] : [])] });
      if (c.freemiumOver) u.subscription = withLegacy({ ...u.subscription, ledger: { ...u.subscription.ledger, freeUsed: 100, monthUsed: 0, overage: 9 } });
    }
    if (c.pastDue) {
      const label = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      docQueue.push({ userId: u.id, date: daysAgo(3), kind: 'Renewal', status: 'Unpaid', lines: [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: label } }, amount: pkg.price, kind: 'package' }, { desc: { key: 'Extra documents · {period}', vars: { period: 'last month' } }, qty: 14, unitPrice: pkg.overagePrice, amount: 14 * pkg.overagePrice, kind: 'overage' }], markPastDue: true });
      u.card = { ...u.card, failNext: true, exp: '10/26' };
    }
    if (c.stage === 'Suspended') {
      u.subscription = { ...u.subscription, status: 'Suspended', graceUntil: iso(daysAgo(1)) };
      u.stageHistory.push({ from: 'Active', to: 'Suspended', at: iso(daysAgo(1)), by: 'System', note: 'Not paid after the grace period' });
      docQueue.push({ userId: u.id, date: daysAgo(8), kind: 'Renewal', status: 'Unpaid', lines: [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: 'this month' } }, amount: pkg.price, kind: 'package' }], markSuspended: true });
    }
    if (c.stage === 'Disconnected') {
      u.subscription = { ...u.subscription, status: 'Ended', autoRenew: false };
      u.linkingPending = { status: 'Unlinked', peppolId: `0235:${u.company.tin}`, smpRegistered: false, unlinkedAt: iso(daysAgo(10)), movedTo: 'Another accredited provider' };
      u.archiveUntil = iso(new Date(Date.now() + 80 * 86400000));
      u.serviceRequests = [{ id: 'SR-SEED1', kind: 'Move provider', newProvider: 'Another accredited provider', status: 'Done', requestedAt: iso(daysAgo(11)), doneAt: iso(daysAgo(10)), by: c.owner, steps: [{ at: iso(daysAgo(11)), action: 'Requested', by: c.owner }, { at: iso(daysAgo(10)), action: 'Approved by manager', by: 'MEI Administrator' }, { at: iso(daysAgo(10)), action: 'Moved to {provider}. Removed from SMP.', by: 'Noura Al Hammadi' }] }];
      u.stageHistory.push({ from: 'Active', to: 'Disconnected', at: iso(daysAgo(10)), by: 'Noura Al Hammadi', note: 'Move provider' });
    }
    if (c.partner) u.partner = { partnerId: c.partner, method: 'Portal', at: iso(daysAgo(c.paidDays + 1)), by: 'TechBridge ERP' };
    users.push(u);
  });

  // Partner attribution for two existing customers.
  const demo = users.find((u) => u.email === DEMO_EMAIL);
  if (demo) { demo.partner = { partnerId: 'PT-101', method: 'Link', at: iso(daysAgo(135)), by: 'Referral link' }; demo.partnerConsent = false; }
  const desert = users.find((u) => u.id === 'seed-desert');
  if (desert) desert.partner = { partnerId: 'PT-101', method: 'Code', at: iso(daysAgo(90)), by: 'Partner code' };
  saveUsers(users);

  // 3) Model invoices, numbered in date order.
  if (!getModelDocs().length) {
    docQueue.sort((a, b) => a.date - b.date).forEach((q) => {
      const doc = issueInvoice({ customerId: q.userId, kind: q.kind, lines: q.lines, method: q.method || 'Card', paymentRef: q.status === 'Unpaid' ? '' : `pi_seed${Math.random().toString(36).slice(2, 8)}`, status: q.status || 'Paid' });
      const docs = getModelDocs().map((d) => (d.id === doc.id ? { ...d, date: iso(q.date), emailedAt: iso(q.date) } : d));
      write('mei_model_docs', docs);
      if (q.markPastDue || q.markSuspended) {
        const all = getUsers();
        const u = all.find((x) => x.id === q.userId);
        u.subscription = { ...u.subscription, ...(q.markPastDue ? { status: 'Past due', graceUntil: iso(new Date(Date.now() + 4 * 86400000)) } : {}), unpaidInvoice: doc.id };
        u.payments = [...(u.payments || []), { id: `fail_${doc.id}`, date: iso(q.date), type: 'Renewal', invoiceId: doc.id, method: 'Card', description: { key: 'Renewal · {period}', vars: { period: 'this month' } }, total: doc.total, status: 'Failed' }];
        saveUsers(all);
      }
    });
  }
  // Now link the active customers: their invoices were sent as e-invoices (one rejected, for the IT queue).
  const all = getUsers();
  all.forEach((u) => { if (u.linkingPending) { u.linking = u.linkingPending; delete u.linkingPending; } });
  saveUsers(all);
  const linkedIds = new Set(all.filter((u) => u.linking?.status === 'Linked' || u.linking?.status === 'Unlinked').map((u) => u.id));
  let rejectedOne = false;
  write('mei_model_docs', getModelDocs().map((d) => {
    if (!linkedIds.has(d.customerId)) return d;
    if (!rejectedOne && d.customerId === 'seed-desert') { rejectedOne = true; return { ...d, einvoice: { status: 'Rejected', at: d.date, error: 'Receiver endpoint not found in SMP (simulated)' } }; }
    return { ...d, einvoice: { status: 'Sent', at: d.date, ref: `MSG-${d.id.slice(-6)}`, to: getUsers().find((u) => u.id === d.customerId)?.linking?.peppolId } };
  }));

  // 4) Partners, commissions and a paid statement.
  if (!read('mei_partners', []).length) {
    const tpl = getPlatform().commissionTemplates;
    write('mei_partners', [
      { id: 'PT-101', name: 'Al Mizan Accounting', type: 'Referral', contactName: 'Faisal Al Mizan', email: 'faisal@almizan.ae', phone: '+971 50 111 2233', tradeLicense: 'CN-5512345', trn: '100444333200003', website: 'almizan.ae', emirate: 'Dubai', status: 'Active', plan: { ...tpl[0], since: iso(daysAgo(160)) }, agreement: { version: '1.0', at: iso(daysAgo(158)), by: 'Faisal Al Mizan' }, code: 'MIZAN101', bank: { bankName: 'Emirates NBD', accountName: 'Al Mizan Accounting', iban: 'AE120260001234567890123', verified: true, at: iso(daysAgo(150)) }, users: [{ id: 'pu-101a', name: 'Faisal Al Mizan', email: 'partner@almizan.ae', password: 'Demo@2026', role: 'Account manager', status: 'Active' }, { id: 'pu-101b', name: 'Reem Saleh', email: 'reem@almizan.ae', password: 'Demo@2026', role: 'User', status: 'Active' }], docs: [{ name: 'trade-licence.pdf', at: iso(daysAgo(165)) }], createdAt: iso(daysAgo(165)), activatedAt: iso(daysAgo(158)), history: [{ at: iso(daysAgo(165)), action: 'Application received', by: 'Faisal Al Mizan' }, { at: iso(daysAgo(160)), action: 'Plan assigned', by: 'MEI Administrator' }, { at: iso(daysAgo(158)), action: 'Agreement v{v} accepted · activated', vars: { v: '1.0' }, by: 'Faisal Al Mizan' }] },
      { id: 'PT-102', name: 'TechBridge ERP', type: 'Implementation', contactName: 'Priyanka Rao', email: 'priyanka@techbridge.ae', phone: '+971 55 222 3344', tradeLicense: 'DMCC-77881', trn: '100555444300003', website: 'techbridge.ae', emirate: 'Dubai', status: 'Active', plan: { ...tpl[2], since: iso(daysAgo(60)) }, agreement: { version: '1.0', at: iso(daysAgo(58)), by: 'Priyanka Rao' }, code: 'TBRG202', bank: null, users: [{ id: 'pu-102a', name: 'Priyanka Rao', email: 'partner@techbridge.ae', password: 'Demo@2026', role: 'Account manager', status: 'Active' }], docs: [], createdAt: iso(daysAgo(64)), activatedAt: iso(daysAgo(58)), history: [{ at: iso(daysAgo(64)), action: 'Application received', by: 'Priyanka Rao' }, { at: iso(daysAgo(58)), action: 'Agreement v{v} accepted · activated', vars: { v: '1.0' }, by: 'Priyanka Rao' }] },
      { id: 'PT-103', name: 'Smart Advisors', type: 'Sales agent', contactName: 'Tariq Hassan', email: 'tariq@smartadvisors.ae', phone: '+971 52 333 4455', tradeLicense: 'CN-6654321', trn: '', website: 'smartadvisors.ae', emirate: 'Abu Dhabi', status: 'Applied', plan: null, agreement: null, code: null, bank: null, users: [{ id: 'pu-103a', name: 'Tariq Hassan', email: 'tariq@smartadvisors.ae', password: 'Demo@2026', role: 'Account manager', status: 'Active' }], docs: [{ name: 'trade-licence.pdf', at: iso(daysAgo(1)) }, { name: 'company-profile.pdf', at: iso(daysAgo(1)) }], message: 'We advise 40 SMEs in Abu Dhabi and would like to refer them.', createdAt: iso(daysAgo(1)), history: [{ at: iso(daysAgo(1)), action: 'Application received', by: 'Tariq Hassan' }] },
    ]);
    const docs = getModelDocs();
    const demoDocs = demo ? docs.filter((d) => d.customerId === demo.id && d.type === 'Invoice').sort((a, b) => a.date.localeCompare(b.date)) : [];
    const cm = [];
    demoDocs.forEach((d, n) => {
      const base = d.lines.filter((l) => l.kind !== 'setup' && l.kind !== 'overage').reduce((s, l) => s + l.amount, 0);
      const rate = n === 0 ? 10 : 5;
      const age = (Date.now() - new Date(d.date).getTime()) / 86400000;
      cm.push({ id: `CM-${1001 + n}`, partnerId: 'PT-101', customerId: demo.id, company: demo.company.name, invoiceId: d.id, type: n === 0 ? 'New' : 'Renewal', base, rate, amount: +(base * rate / 100).toFixed(2), status: n < 2 ? 'Paid' : age > 14 ? 'Due' : 'Held', paidAt: d.date, holdUntil: iso(new Date(d.date).getTime() + 14 * 86400000), createdAt: d.date, statementId: n < 2 ? 'ST-501' : undefined });
    });
    const dDocs = docs.filter((d) => d.customerId === 'seed-desert' && d.type === 'Invoice').slice(0, 2);
    dDocs.forEach((d, n) => {
      const base = d.lines.filter((l) => l.kind === 'package').reduce((s, l) => s + l.amount, 0);
      cm.push({ id: `CM-${1101 + n}`, partnerId: 'PT-101', customerId: 'seed-desert', company: 'Desert Rose Interiors', invoiceId: d.id, type: 'Renewal', base, rate: 5, amount: +(base * 0.05).toFixed(2), status: 'Due', paidAt: d.date, holdUntil: iso(new Date(d.date).getTime() + 14 * 86400000), createdAt: d.date });
    });
    const palmDoc = docs.find((d) => d.customerId === 'seed-n-orbit');
    if (palmDoc) {
      const base = palmDoc.subtotal;
      cm.push({ id: 'CM-1201', partnerId: 'PT-102', customerId: 'seed-n-orbit', company: 'Orbit Software House', invoiceId: palmDoc.id, type: 'New', base, rate: 15, amount: +(base * 0.15).toFixed(2), status: 'Held', paidAt: palmDoc.date, holdUntil: iso(new Date(palmDoc.date).getTime() + 14 * 86400000), createdAt: palmDoc.date, note: 'Held until the customer is active' });
    }
    write('mei_commissions', cm);
    const paidSt = cm.filter((c) => c.statementId === 'ST-501');
    write('mei_statements', [{ id: 'ST-501', partnerId: 'PT-101', partnerName: 'Al Mizan Accounting', period: 'Earlier months', commissionIds: paidSt.map((c) => c.id), total: +paidSt.reduce((s, c) => s + c.amount, 0).toFixed(2), status: 'Paid', createdAt: iso(daysAgo(70)), approvedAt: iso(daysAgo(68)), invoice: { number: 'AMA-2026-044', amount: +paidSt.reduce((s, c) => s + c.amount, 0).toFixed(2), fileName: 'AMA-2026-044.pdf', at: iso(daysAgo(66)) }, payout: { ref: 'FT2609AE12345', at: iso(daysAgo(64)) }, history: [{ at: iso(daysAgo(70)), action: 'Created and sent to partner', by: 'MEI Administrator' }, { at: iso(daysAgo(68)), action: 'Approved by manager', by: 'MEI Administrator' }, { at: iso(daysAgo(64)), action: 'Paid · {ref}', vars: { ref: 'FT2609AE12345' }, by: 'MEI Administrator' }] }]);
  }

  // 5) Leads (CRM) from every source.
  if (!read('mei_leads', []).length) {
    const L = (id, name, company, email, source, stage, assigneeId, ageDays, extra = {}) => ({ id, name, company, email, phone: '+971 50 9' + id.slice(-6), source, partnerId: null, stage, assigneeId, value: extra.value || 0, package: extra.package || '', createdAt: iso(daysAgo(ageDays)), contactedAt: stage === 'New' ? null : iso(daysAgo(ageDays - 0.5)), notes: extra.notes || [], followUps: extra.followUps || [], lossReason: extra.lossReason || '', tool: extra.tool || null, invite: extra.invite || null, unsubscribed: false, history: [{ at: iso(daysAgo(ageDays)), action: 'Created from {source}', vars: { source }, by: 'Website' }] });
    write('mei_leads', [
      L('LD-2012', 'Mohammed Saeed', 'Saeed Electronics', 'mohammed@saeedelec.ae', 'Obligation tool', 'New', 'st-sales1', 2, { tool: { revenue: 'Over AED 50M', b2b: true, deadline: '2026-07-01', package: 'Pro' } }),
      L('LD-2011', 'Ayesha Khan', 'Khan Logistics', 'ayesha@khanlog.ae', 'WhatsApp', 'New', 'st-sales2', 0.2),
      L('LD-2010', 'George Haddad', 'Haddad Group', 'george@haddadgroup.ae', 'Enterprise', 'Proposal', 'st-sales1', 9, { value: 48000, package: 'Enterprise', notes: [{ at: iso(daysAgo(7)), by: 'Lina Haddad', text: '6 entities, SAP integration. Sent proposal v2.' }], followUps: [{ id: 'fu1', dueAt: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), text: 'Call about the proposal', done: false }] }),
      L('LD-2009', 'Sara Lim', 'Lim Trading', 'sara@limtrading.ae', 'Website form', 'Qualified', 'st-sales2', 5, { package: 'Basic' }),
      L('LD-2008', 'Bilal Ahmed', 'Ahmed & Sons', 'bilal@ahmedsons.ae', 'Existing Model client', 'Proposal', 'st-sales1', 12, { invite: { token: 'inv8a7c3d', link: `${window.location.origin}/register?invite=inv8a7c3d`, status: 'Opened', sentAt: iso(daysAgo(11)), openedAt: iso(daysAgo(10)) } }),
      L('LD-2007', 'Fatima Noor', 'Noor Clinics', 'fatima@noorclinics.ae', 'Existing Model client', 'New', 'st-sales2', 3, { invite: { token: 'inv5b2e9f', link: `${window.location.origin}/register?invite=inv5b2e9f`, status: 'Sent', sentAt: iso(daysAgo(3)) } }),
      L('LD-2006', 'Daniel Costa', 'Costa Imports', 'daniel@costaimports.ae', 'Partner', 'Qualified', 'st-sales1', 6, { notes: [{ at: iso(daysAgo(5)), by: 'Lina Haddad', text: 'Referred by Al Mizan. Wants annual billing.' }] }),
      L('LD-2005', 'Hessa Al Mazrouei', 'Mazrouei Real Estate', 'hessa@mazrouei.ae', 'Advertisement', 'Won', 'st-sales2', 20),
      L('LD-2004', 'Peter Novak', 'Novak Engineering', 'peter@novakeng.ae', 'Website form', 'Lost', 'st-sales1', 25, { lossReason: 'Price' }),
      L('LD-2003', 'Rana Aziz', 'Aziz Fashion', 'rana@azizfashion.ae', 'Obligation tool', 'Lost', 'st-sales2', 30, { lossReason: 'Not obligated yet' }),
    ].map((l) => (l.id === 'LD-2006' ? { ...l, partnerId: 'PT-101' } : l)));
    // Overdue first contact → escalation demo.
    const t = createTask({ type: 'lead-contact', team: 'Sales', ref: { kind: 'lead', id: 'LD-2012', name: 'Saeed Electronics' } });
    const t2 = createTask({ type: 'lead-contact', team: 'Sales', ref: { kind: 'lead', id: 'LD-2011', name: 'Khan Logistics' } });
    write('mei_tasks', getTasks().map((x) => (x.id === t.id ? { ...x, assigneeId: 'st-sales1', createdAt: iso(daysAgo(2)), dueAt: iso(daysAgo(1)) } : x.id === t2.id ? { ...x, assigneeId: 'st-sales2' } : x)));
  }

  // 6) Tasks for the customers in progress (some late, to show escalation).
  const ref = (id, name) => ({ kind: 'company', id, name });
  const mk = (type, id, name, ageH, note = '') => {
    const t = createTask({ type, ref: ref(id, name), note });
    write('mei_tasks', getTasks().map((x) => (x.id === t.id ? { ...x, createdAt: iso(Date.now() - ageH * 3600000), dueAt: iso(Date.now() - ageH * 3600000 + 4 * 3600000) } : x)));
  };
  mk('docs-missing', 'seed-n-zahra', 'Zahra Dental Clinic', 20, 'Emirates ID: Please upload both sides of the Emirates ID.');
  mk('docs-review', 'seed-n-orbit', 'Orbit Software House', 30, 'All required documents uploaded.');
  mk('peppol-failed', 'seed-n-marina', 'Marina Yacht Services', 2, 'Authorisation not found in EmaraTax yet (simulated).');
  mk('renewal-failed', 'seed-n-saffron:renew', 'Saffron Foodstuff', 60);
  createTask({ type: 'partner-application', ref: { kind: 'partner', id: 'PT-103', name: 'Smart Advisors' } });
  createTask({ type: 'einvoice-failed', ref: { kind: 'doc', id: 'seed-rejected', name: 'Desert Rose Interiors' }, note: 'Receiver endpoint not found in SMP (simulated)' });
  const falcon = getUsers().find((u) => u.id === 'seed-falcon');
  if (falcon?.refunds?.length) createTask({ type: 'refund-approval', ref: { kind: 'refund', id: `seed-falcon:${falcon.refunds[0].id}`, name: `${falcon.refunds[0].id} · Falcon Logistics` }, note: 'Exception: outside the refund rules' });

  // 7) A bank transfer waiting for confirmation (annual Premium for Crescent General Trading).
  if (!read('mei_orders', []).length) {
    const pkg = getPackage('premium');
    const lines = [{ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: 'Annual' } }, amount: pkg.annualPrice, monthly: pkg.price, kind: 'package' }, { desc: { key: 'Setup fee ({type})', vars: { type: pkg.setupFeeType } }, amount: pkg.setupFee, kind: 'setup' }];
    const sub = lines.reduce((s, l) => s + l.amount, 0);
    const order = { id: 'ORD-3001', userId: 'seed-n-crescent', company: 'Crescent General Trading', cart: { type: 'package', packageId: 'premium', months: 12 }, quote: { lines, subtotal: sub, vat: +(sub * 0.05).toFixed(2), total: +(sub * 1.05).toFixed(2), rate: 5, included: false }, method: 'Bank transfer', bankRef: 'GST-TRF-0915', status: 'Awaiting payment confirmation', createdAt: iso(daysAgo(1)) };
    write('mei_orders', [order]);
    createTask({ type: 'bank-transfer', ref: { kind: 'order', id: order.id, name: 'ORD-3001 · Crescent General Trading' }, note: 'Annual Premium · ref GST-TRF-0915' });
  }

  // 8) Last month's reconciliation with the technical partner.
  const prev = new Date(); prev.setMonth(prev.getMonth() - 1);
  const m = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  if (!read('mei_reconciliation', {})[m]) importPartnerInvoice(m);
}
