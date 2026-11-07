// Demo data so every screen has realistic content in this front-end-only build.
// Runs once per browser (versioned). Remove when the real backend is connected.
import { getUsers, saveUsers, read, write, seedDemoAccount, DEMO_EMAIL, getDemoActivity } from './api';
import { SAMPLE_MASTER_DATA, SAMPLE_COMPANY_EXTRAS } from './masterData';
import { computeTotals } from './invoices';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './admin';
import { getPackage, periodPrice, addOns } from '../data/packages';
import { addLog } from './logs';
import { seedTickets } from './support';

const SEED_KEY = 'mei_seed_v';
const VERSION = 7;

let rngState = 42;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) % 4294967296; return rngState / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n, w = 6) => String(n).padStart(w, '0');

function makeInvoices(user, count, { hours = 24 * 14, startSeq = 1000, failRate = 0.05 } = {}) {
  const out = [];
  let seq = startSeq;
  for (let k = 0; k < count; k++) {
    seq += 1;
    // newer invoices are denser: more volume in the last 24h
    const ageH = k < count * 0.35 ? rnd() * 24 : rnd() * hours;
    const created = new Date(Date.now() - ageH * 3600000);
    const customer = pick(user.customers);
    const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
      const p = pick(user.products);
      return { productId: p.id, name: p.name, qty: 1 + Math.floor(rnd() * 5), price: p.price, vatRate: p.vatRate };
    });
    const totals = computeTotals(items, {});
    const failed = rnd() < failRate;
    const t0 = created.getTime();
    const at = (s) => new Date(t0 + s * 1000).toISOString();
    const wl = `WL-${pad(100000 + Math.floor(rnd() * 899999))}`;
    const history = failed
      ? [{ status: 'Queued', at: at(0), note: 'Validation passed. Added to queue.' },
         { status: 'Processing', at: at(60), note: 'Picked by the background process.' },
         { status: 'Sent to White Label', at: at(65), note: 'Sent to White Label over HTTPS (token auth).' },
         { status: 'Failed', at: at(3600), note: 'Failed after {max} attempts: {err}', vars: { max: 10, err: '503 Service Unavailable' } }]
      : [{ status: 'Queued', at: at(0), note: 'Validation passed. Added to queue.' },
         { status: 'Processing', at: at(60), note: 'Picked by the background process.' },
         { status: 'Sent to White Label', at: at(65), note: 'Sent to White Label over HTTPS (token auth).' },
         { status: 'Success', at: at(70), note: 'White Label accepted the invoice ({wl}).', vars: { wl } }];
    out.push({
      id: `INV-${seq}`, queueId: `Q${pad(100000 + Math.floor(rnd() * 899999))}`, idempotencyKey: `${user.id}:${seq}`,
      externalRef: null, source: pick(['Manual', 'Manual', 'Excel', 'API', 'API']),
      customerId: customer.id, customerName: customer.name, customerTrn: customer.trn,
      issueDate: created.toISOString().slice(0, 10), notes: '', discountPct: 0,
      items: totals.lines, subtotal: totals.subtotal, discount: totals.discount, vat: totals.vat, total: totals.total,
      status: failed ? 'Failed' : 'Success', retryCount: failed ? 10 : 0, phaseAt: t0, nextAttemptAt: null,
      wlInvoiceId: failed ? null : wl, lastError: failed ? '503 Service Unavailable' : null,
      history, createdAt: created.toISOString(),
    });
  }
  return { invoices: out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), seq };
}

function subscription(pkgId, { daysAgo = 10, months = 1, usedPct = 0.4, addon = 0 } = {}) {
  const pkg = getPackage(pkgId);
  const start = new Date(Date.now() - daysAgo * 86400000);
  const end = new Date(start); end.setMonth(end.getMonth() + months);
  const limit = pkg.transactions * months + addon;
  return {
    packageId: pkg.id, packageName: pkg.name, months, transactionsLimit: limit,
    transactionsUsed: Math.round(limit * usedPct), addonTransactions: addon, usersLimit: pkg.users,
    startDate: start.toISOString(), endDate: end.toISOString(), status: 'Active',
    paymentId: `pi_seed${Math.floor(rnd() * 1e6)}`, total: Math.round(pkg.price * months * 1.05), pendingChange: null,
  };
}

const DEMO_COMPANIES = [
  { id: 'seed-xyz', fullName: 'Khalid Rahman', email: 'khalid@xyzco.ae', company: 'XYZ Company', trn: '100111222300003', emirate: 'Abu Dhabi', pkg: 'platinum', usedPct: 0.2, invoices: 60, team: 6 },
  { id: 'seed-noor', fullName: 'Mariam Al Noor', email: 'mariam@alnoor.ae', company: 'Al Noor LLC', trn: '100222333400003', emirate: 'Dubai', pkg: 'basic', usedPct: 0.9, invoices: 25, team: 1 },
  { id: 'seed-desert', fullName: 'Ravi Menon', email: 'ravi@desertrose.ae', company: 'Desert Rose Interiors', trn: '100333444500003', emirate: 'Sharjah', pkg: 'standard', usedPct: 0.55, invoices: 40, team: 3, daysAgo: 26 },
  { id: 'seed-falcon', fullName: 'Fatima Saeed', email: 'fatima@falconlog.ae', company: 'Falcon Logistics', trn: '100444555600003', emirate: 'Dubai', pkg: 'standard', usedPct: 0.3, invoices: 45, team: 4, refund: true },
];


// ----- v6: a year of sales history and more companies for the system admin -----
const MORE_COMPANIES = [
  ['seed-blue', 'Blue Wave Marine', 'Yousef Karim', 'yousef@bluewave.ae', 'Abu Dhabi', 'standard', 11],
  ['seed-emfood', 'Emirates Foods Trading', 'Layla Haddad', 'layla@emiratesfoods.ae', 'Dubai', 'platinum', 10],
  ['seed-oasis', 'Oasis Medical Center', 'Dr. Salma Hassan', 'salma@oasismc.ae', 'Abu Dhabi', 'standard', 9],
  ['seed-gulf', 'Gulf Star Trading', 'Imran Sheikh', 'imran@gulfstar.ae', 'Sharjah', 'basic', 9],
  ['seed-palm', 'Palm Tech Solutions', 'Arjun Rao', 'arjun@palmtech.ae', 'Dubai', 'platinum', 8],
  ['seed-sand', 'Sandstone Contracting', 'Hamad Al Ali', 'hamad@sandstone.ae', 'Ajman', 'standard', 7],
  ['seed-pearl', 'Pearl Jewellers', 'Noura Saleh', 'noura@pearljewel.ae', 'Dubai', 'basic', 6],
  ['seed-rak', 'RAK Ceramics Supplies', 'Tariq Mahmoud', 'tariq@rakcs.ae', 'Ras Al Khaimah', 'standard', 5, { churnAgo: 1 }],
  ['seed-fuj', 'Fujairah Port Services', 'Ali Rashid', 'ali@fujport.ae', 'Fujairah', 'platinum', 4],
  ['seed-cedar', 'Cedar Consulting', 'Rana Khoury', 'rana@cedarco.ae', 'Dubai', 'basic', 3, { upgradeTo: 'standard' }],
  ['seed-uaq', 'UAQ Fresh Farms', 'Mohammed Obaid', 'mo@uaqfarms.ae', 'Umm Al Quwain', 'basic', 2],
  ['seed-atlas', 'Atlas Logistics', 'Karen Smith', 'karen@atlaslog.ae', 'Dubai', 'standard', 1],
  ['seed-nova', 'Nova Digital Agency', 'Ziad Fares', 'ziad@novadigital.ae', 'Dubai', 'standard', 0],
  ['seed-old', 'Horizon Printing', 'George Thomas', 'george@horizonprint.ae', 'Sharjah', 'basic', 8, { churnAgo: 3 }],
];

const monthsAgo = (n, day = 5) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); d.setDate(Math.min(day, 28)); d.setHours(10 + (n % 6), 15, 0, 0); return d; };
const pkgPayment = (id, date, type, pkgId, months = 1) => ({
  id, date: date.toISOString(), type, packageId: pkgId,
  description: { key: '{name} package · {months} month(s)', vars: { name: getPackage(pkgId).name, months } },
  total: +(periodPrice(getPackage(pkgId), months) * 1.05).toFixed(2), status: 'Paid',
});

/** Monthly payments from `startAgo` months ago until now (or until churn), with add-ons and an optional upgrade. */
function paymentHistory(id, pkgId, startAgo, { churnAgo = -1, upgradeTo = null } = {}) {
  const out = [];
  let pkg = pkgId;
  const day = 3 + Math.floor(rnd() * 20);
  for (let m = startAgo; m > churnAgo && m >= 0; m--) {
    let date = monthsAgo(m, day);
    if (date > new Date()) date = new Date(Date.now() - 3 * 3600000); // this month's payment day is still ahead: use today
    if (upgradeTo && m === Math.floor(startAgo / 2) && pkg !== upgradeTo) {
      out.push({ id: `pi_${id}_u${m}`, date: new Date(date.getTime() - 9 * 86400000).toISOString(), type: 'Upgrade', packageId: upgradeTo, description: { key: 'Upgrade to {name}', vars: { name: getPackage(upgradeTo).name } }, total: +((getPackage(upgradeTo).price - getPackage(pkg).price) * 0.6 * 1.05).toFixed(2), status: 'Paid' });
      pkg = upgradeTo;
    }
    out.push(pkgPayment(`pi_${id}_${m}`, date, m === startAgo ? 'New' : 'Renewal', pkg));
    if (rnd() < 0.22 && m > 0) {
      const a = pick(addOns);
      out.push({ id: `pi_${id}_a${m}`, date: new Date(date.getTime() + 14 * 86400000).toISOString(), type: 'Add-on', packageId: pkg, description: { key: 'Add-on · +{n} transactions', vars: { n: a.transactions } }, total: +(a.price * 1.05).toFixed(2), status: 'Paid' });
    }
  }
  return { payments: out.filter((p) => new Date(p.date) <= new Date()), pkg };
}

function migrateV6() {
  const users = getUsers();
  const has = new Set(users.map((u) => u.id));
  // Older payments for the companies that already exist.
  const back = { 'demo-user-0001': ['standard', 5], 'seed-xyz': ['platinum', 9], 'seed-noor': ['basic', 7], 'seed-desert': ['standard', 6], 'seed-falcon': ['standard', 4] };
  users.forEach((u) => {
    (u.payments || []).forEach((p) => {
      if (p.type) return;
      const k = p.description?.key || '';
      p.type = k.startsWith('Add-on') ? 'Add-on' : k.startsWith('Upgrade') ? 'Upgrade' : k.startsWith('Refund') ? 'Refund' : 'Renewal';
      p.packageId = p.packageId || u.subscription?.packageId;
    });
    if (back[u.id] && !(u.payments || []).some((p) => String(p.id).includes('_hist'))) {
      const [pkgId, ago] = back[u.id];
      const { payments } = paymentHistory(`${u.id}_hist`, pkgId, ago, { churnAgo: 0 });
      u.payments = [...payments, ...(u.payments || [])];
      const created = new Date(payments[0]?.date || u.createdAt);
      if (created < new Date(u.createdAt)) u.createdAt = created.toISOString();
    }
  });
  // New companies.
  MORE_COMPANIES.forEach(([id, company, fullName, email, emirate, pkgId, startAgo, opts = {}]) => {
    if (has.has(id)) return;
    const { payments, pkg: currentPkg } = paymentHistory(id, pkgId, startAgo, opts);
    const last = [...payments].reverse().find((p) => p.type === 'New' || p.type === 'Renewal');
    const start = new Date(last.date);
    const end = new Date(start); end.setMonth(end.getMonth() + 1);
    const p = getPackage(currentPkg);
    const churned = (opts.churnAgo ?? -1) >= 0;
    const u = {
      id, fullName, email, password: 'Demo@2026', role: 'Owner', createdAt: monthsAgo(startAgo, 2).toISOString(),
      company: { name: company, legalName: `${company} L.L.C`, tradeLicense: `CN-${Math.floor(1e6 + rnd() * 8e6)}`, trn: `100${String(Math.floor(1e11 + rnd() * 8.9e11)).slice(0, 9)}003`, emirate, street: `${emirate} Business Centre, Office ${100 + Math.floor(rnd() * 800)}`, city: emirate, country: 'AE' },
      subscription: {
        packageId: p.id, packageName: p.name, months: 1, transactionsLimit: p.transactions, transactionsUsed: Math.round(p.transactions * (churned ? 0.7 : 0.15 + rnd() * 0.7)),
        addonTransactions: 0, usersLimit: p.users, startDate: start.toISOString(), endDate: end.toISOString(), status: 'Active', paymentId: last.id, total: last.total, pendingChange: null,
      },
      teamUsers: Array.from({ length: Math.min(p.users - 1, 1 + Math.floor(rnd() * 4)) }, (_, i) => ({ id: `${id}-tm${i}`, name: `Team member ${i + 1}`, email: `user${i + 1}@${email.split('@')[1]}`, role: pick(['Accountant', 'Admin', 'Viewer']), status: 'Active' })),
      ...SAMPLE_MASTER_DATA,
      payments,
    };
    const { invoices, seq } = makeInvoices(u, churned ? 15 : 20 + Math.floor(rnd() * 45), { hours: 24 * (churned ? 120 : 90), failRate: 0.02 + rnd() * 0.08 });
    if (churned) invoices.forEach((inv) => { const d = new Date(new Date(inv.createdAt).getTime() - opts.churnAgo * 30 * 86400000); inv.createdAt = d.toISOString(); inv.issueDate = inv.createdAt.slice(0, 10); });
    u.invoices = invoices; u.invoiceSeq = seq;
    u.activity = getDemoActivity(u.id, Math.max(40, u.subscription.transactionsUsed));
    u.notifications = [];
    users.push(u);
  });
  // Spread part of the older companies' invoices over the last 3 months so monthly reports have depth.
  users.forEach((u) => {
    if (!String(u.id).startsWith('seed-') || u.v6spread) return;
    (u.invoices || []).forEach((inv, i) => {
      if (i % 3 === 0) { const d = new Date(new Date(inv.createdAt).getTime() - (20 + (i % 70)) * 86400000); inv.createdAt = d.toISOString(); inv.issueDate = inv.createdAt.slice(0, 10); }
    });
    u.invoices?.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    u.v6spread = true;
  });
  saveUsers(users);
  seedTickets(users);
  if (!read('mei_broadcasts', null)) {
    write('mei_broadcasts', [
      { id: 'BC-SEED2', at: new Date(Date.now() - 2 * 86400000).toISOString(), audience: 'low', level: 'warning', title: 'Running low on invoices', message: 'You have used 80% of your package. Buy an add-on to keep sending without interruption.', link: 'addon', count: 3, companies: [] },
      { id: 'BC-SEED1', at: new Date(Date.now() - 9 * 86400000).toISOString(), audience: 'all', level: 'info', title: 'Scheduled maintenance', message: 'The platform will be read-only on Saturday 01:00–03:00 (UAE time). Invoices queue and send afterwards.', link: '', count: 19, companies: [] },
    ]);
  }
}

/** v7: demo support tickets get a team. */
function migrateV7() {
  const team = { 'TCK-1012': 'Technical team', 'TCK-1011': 'Billing team', 'TCK-1010': 'Support team', 'TCK-1009': 'Technical team', 'TCK-1008': 'Billing team', 'TCK-1006': 'Technical team', 'TCK-1005': 'Billing team', 'TCK-1003': 'Support team' };
  const list = read('mei_tickets', []);
  list.forEach((tk) => { if (tk.assignee === undefined && team[tk.id]) tk.assignee = team[tk.id]; });
  write('mei_tickets', list);
}

/** Sample notifications so the bell has realistic content (newest first). */
export function demoNotifications(user) {
  const h = (n) => new Date(Date.now() - n * 3600000).toISOString();
  const s = user.subscription || {};
  const left = Math.max(0, (s.transactionsLimit || 0) - (s.transactionsUsed || 0));
  const inv = (user.invoices || []).filter((i) => i.status === 'Success');
  const failed = (user.invoices || []).find((i) => i.status === 'Failed');
  const id = (k, fb) => inv[k]?.id || fb;
  return [
    { id: 'dn1', level: 'warning', key: '{left} invoices left in your package.', vars: { left }, link: 'addon', at: h(0.3), read: false },
    { id: 'dn2', level: 'success', key: 'Invoice {id} was delivered to {customer} through Peppol.', vars: { id: id(0, 'INV-1240'), customer: inv[0]?.customerName || 'Al Noor LLC' }, link: 'invoices', at: h(0.8), read: false },
    { id: 'dn3', level: 'danger', key: 'Invoice {id} failed after {max} attempts ({err}).', vars: { id: failed?.id || 'INV-1188', max: 10, err: '503 Service Unavailable' }, link: 'invoices', at: h(2), read: false },
    { id: 'dn4', level: 'success', key: 'Excel import finished: {n} customers added, {u} updated.', vars: { n: 12, u: 3 }, link: 'customers', at: h(5), read: false },
    { id: 'dn5', level: 'warning', key: 'Your package ends in {days} days. Renew now to keep sending invoices.', vars: { days: 5 }, link: 'renew', at: h(9), read: true },
    { id: 'dn6', level: 'info', key: 'Customer {name} is missing a city. Complete it before invoicing.', vars: { name: 'Gulf Star Trading' }, link: 'customers', at: h(20), read: true },
    { id: 'dn7', level: 'success', key: '{n} invoices from Excel were validated and queued.', vars: { n: 18 }, link: 'invoices', at: h(26), read: true },
    { id: 'dn8', level: 'info', key: 'New user {name} was added to your company.', vars: { name: 'Sara Al Mansoori' }, link: 'users', at: h(30), read: true },
    { id: 'dn9', level: 'success', key: 'Payment of {amount} received for the add-on (+{n} transactions).', vars: { amount: 'AED 94.5', n: 100 }, link: 'plan', at: h(72), read: true },
    { id: 'dn10', level: 'info', key: 'Item {name} was added to {category}.', vars: { name: 'Business laptop', category: 'Hardware' }, link: 'items', at: h(96), read: true },
    { id: 'dn11', level: 'success', key: 'Payment of {amount} received. Your {name} package is active.', vars: { amount: 'AED 525', name: s.packageName || 'Standard' }, link: 'plan', at: h(24 * 25), read: true },
  ];
}

/** v5: richer demo notifications for accounts that only have the old two. */
function migrateV5() {
  const users = getUsers();
  users.forEach((u) => {
    if (u.role === 'SuperAdmin' || !u.subscription) return;
    if ((u.notifications || []).length <= 3) u.notifications = demoNotifications(u);
  });
  saveUsers(users);
}

/** v4: master data and company records gain the e-invoice (UBL) fields. Patches existing data in place. */
function migrateV4() {
  const users = getUsers();
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const sample = { customers: byId(SAMPLE_MASTER_DATA.customers), products: byId(SAMPLE_MASTER_DATA.products), categories: byId(SAMPLE_MASTER_DATA.categories) };
  users.forEach((u) => {
    ['customers', 'products', 'categories'].forEach((k) => {
      if (Array.isArray(u[k])) u[k] = u[k].map((r) => (sample[k][r.id] ? { ...sample[k][r.id], ...r } : r));
    });
    if (u.company && !u.company.street) {
      const extras = u.email === DEMO_EMAIL ? SAMPLE_COMPANY_EXTRAS
        : { street: u.company.address || `${u.company.emirate || 'Dubai'} Business Centre`, city: u.company.emirate || 'Dubai', country: 'AE', legalName: u.company.name };
      u.company = { ...u.company, ...extras, legalName: u.company.legalName || extras.legalName || u.company.name };
    }
  });
  saveUsers(users);
}

export function seedAll() {
  const v = read(SEED_KEY, 0);
  if (v >= VERSION) return;
  if (v >= 3) { if (v === 3) migrateV4(); if (v <= 4) migrateV5(); if (v <= 5) migrateV6(); migrateV7(); write(SEED_KEY, VERSION); return; }
  seedDemoAccount();
  const users = getUsers();

  // Admin account
  if (!users.some((u) => u.email === ADMIN_EMAIL)) {
    users.push({ id: 'admin-0001', fullName: 'MEI Administrator', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'SuperAdmin', createdAt: new Date().toISOString() });
  }

  // Demo account: master data + invoice history
  const demo = users.find((u) => u.email === DEMO_EMAIL);
  if (demo && !demo.invoices) {
    Object.assign(demo, SAMPLE_MASTER_DATA);
    const { invoices, seq } = makeInvoices(demo, 70, { startSeq: 1170 });
    demo.invoices = invoices; demo.invoiceSeq = seq;
    // Show the "invoices left" and "renew" notifications straight away: ~88% used, ends in 5 days.
    const start = new Date(); start.setDate(start.getDate() - 25);
    const end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(Math.min(end.getDate(), new Date().getDate() + 5));
    const endDate = new Date(Date.now() + 5 * 86400000);
    demo.subscription.startDate = start.toISOString();
    demo.subscription.endDate = endDate.toISOString();
    demo.subscription.transactionsUsed = Math.round(demo.subscription.transactionsLimit * 0.88);
    demo.notifications = [
      { id: 'n1', level: 'warning', key: '{left} invoices left in your package.', vars: { left: Math.round(demo.subscription.transactionsLimit * 0.12) }, link: 'addon', at: new Date(Date.now() - 3600000).toISOString(), read: false },
      { id: 'n2', level: 'success', key: 'Payment of {amount} received for the add-on (+{n} transactions).', vars: { amount: 'AED 94.5', n: 100 }, link: 'plan', at: new Date(Date.now() - 3 * 86400000).toISOString(), read: true },
    ];
    demo.apiKey = demo.apiKey || 'mei_live_3f9c2a7b81d64e0c';
  }

  // Other companies for the admin panel
  DEMO_COMPANIES.forEach((c) => {
    if (users.some((u) => u.id === c.id)) return;
    const u = {
      id: c.id, fullName: c.fullName, email: c.email, password: 'Demo@2026', role: 'Owner',
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      company: { name: c.company, legalName: `${c.company} L.L.C`, tradeLicense: `CN-${Math.floor(1e6 + rnd() * 8e6)}`, trn: c.trn, emirate: c.emirate, street: `${c.emirate} Business Centre, Office ${100 + Math.floor(rnd() * 800)}`, city: c.emirate, country: 'AE' },
      subscription: subscription(c.pkg, { usedPct: c.usedPct, daysAgo: c.daysAgo ?? Math.floor(5 + rnd() * 15) }),
      teamUsers: Array.from({ length: c.team }, (_, i) => ({ id: `${c.id}-tm${i}`, name: `Team member ${i + 1}`, email: `user${i + 1}@${c.email.split('@')[1]}`, role: pick(['Accountant', 'Admin', 'Viewer']), status: 'Active' })),
      ...SAMPLE_MASTER_DATA,
      payments: [{ id: `pi_${c.id}`, date: new Date(Date.now() - 12 * 86400000).toISOString(), description: { key: '{name} package · {months} month(s)', vars: { name: getPackage(c.pkg).name, months: 1 } }, total: Math.round(getPackage(c.pkg).price * 1.05), status: 'Paid' }],
    };
    const { invoices, seq } = makeInvoices(u, c.invoices, { failRate: c.pkg === 'basic' ? 0.12 : 0.05 });
    u.invoices = invoices; u.invoiceSeq = seq;
    u.activity = getDemoActivity(u.id, Math.max(60, u.subscription.transactionsUsed));
    if (c.refund) {
      u.refunds = [{
        id: 'RF-00123', status: 'Pending', reason: 'Not satisfied with the service', comments: 'We are moving to our ERP vendor’s own provider.',
        attachments: ['contract.pdf', 'email-thread.pdf'], requestedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        amount: u.payments[0].total, paymentId: u.payments[0].id, packageName: u.subscription.packageName,
        usage: { used: u.subscription.transactionsUsed, limit: u.subscription.transactionsLimit },
        history: [{ status: 'Pending', at: new Date(Date.now() - 2 * 3600000).toISOString(), note: 'Refund request created.' }],
      }];
    }
    users.push(u);
  });

  saveUsers(users);
  migrateV4();
  migrateV5();
  migrateV6();
  migrateV7();
  write(SEED_KEY, VERSION);
  addLog({ type: 'activity', action: 'Demo data loaded', details: 'Admin account, 5 companies and invoice history' });
}
