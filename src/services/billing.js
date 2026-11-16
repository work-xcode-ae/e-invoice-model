// Billing (BIL-02..BIL-11, BR-04..BR-12, BR-18, BR-24, INT-02).
//  - Card for everyone (no surcharge), bank transfer for annual and Enterprise, confirmed by the manager.
//  - No application before a successful payment; the tax invoice is issued at once.
//  - Monthly renewal invoice: subscription + last month's overage + annual setup fee when due, one discount.
//  - Upgrade now with a prorated difference and its own invoice; downgrade from the next cycle.
//  - Auto-renewal with the saved card token; on failure 7 days' grace with daily reminders, then suspension.
// Card data never touches the platform: only a token, brand, last 4 digits and expiry (PCI DSS via the gateway).
import { read, write, fail, delay, getUserById, updateUser, upgradeQuote, getUsers, saveUsers } from './api';
import { getPackage, periodPrice, formatMoney, CUSTOM_PACKAGES_KEY, VAT_RATE, PRICES_INCLUDE_VAT } from '../data/packages';
import { getPlatform } from './platform';
import { addAudit } from './audit';
import { addLog } from './logs';
import { issueInvoice, markPaid, totals, docsOf } from './modelDocs';
import { onPaid, stageOf, suspend, resume, setStage } from './lifecycle';
import { closePeriod, withLegacy } from './usage';
import { createTask, completeTasksFor } from './tasks';
import { sendTemplate } from './messaging';
import { onPayment as commissionOnPayment, activeReferral, partnerByCode, attributeCustomer } from './partners';
import { notify } from './notifications';

const ORDERS_KEY = 'mei_orders';
const PROMOS_KEY = 'mei_promos';
const iso = (d = new Date()) => new Date(d).toISOString();
const who = () => { try { const s = JSON.parse(localStorage.getItem('mei_session')); return s?.user?.fullName || 'System'; } catch { return 'System'; } };

// ---------- Promotions and discounts (BIL-10, BR-18) ----------
export const DEFAULT_PROMOS = [
  { code: 'LAUNCH20', type: 'percent', value: 20, from: '2026-11-01', to: '2027-01-31', maxUses: 100, used: 3, packages: [], active: true, note: 'Launch offer' },
  { code: 'FREEMONTH', type: 'freeMonths', value: 1, from: '2026-11-01', to: '2026-12-31', maxUses: 50, used: 0, packages: ['basic', 'pro'], active: true, note: 'First month free' },
  { code: 'NOSETUP', type: 'setupWaiver', value: 0, from: '2026-11-01', to: '2027-03-31', maxUses: 30, used: 1, packages: [], active: true, note: 'Setup fee waived' },
];
export const getPromos = () => read(PROMOS_KEY, DEFAULT_PROMOS);
export function savePromo(promo) {
  if (!/^[A-Z0-9-]{3,20}$/.test(promo.code || '')) throw fail('Code: 3–20 capital letters, digits or dashes.');
  if (!['percent', 'amount', 'freeMonths', 'setupWaiver'].includes(promo.type)) throw fail('Choose a discount type.');
  if (promo.type === 'percent' && !(promo.value > 0 && promo.value <= 100)) throw fail('A percentage must be between 1 and 100.');
  const list = getPromos();
  const before = list.find((p) => p.code === promo.code) || null;
  write(PROMOS_KEY, before ? list.map((p) => (p.code === promo.code ? { ...p, ...promo } : p)) : [{ used: 0, ...promo }, ...list]);
  addAudit({ area: 'Billing', action: before ? 'Offer changed' : 'Offer created', entity: promo.code, before, after: promo });
}

export function validatePromo(code, pkgId) {
  if (!code) return null;
  const p = getPromos().find((x) => x.code.toLowerCase() === String(code).trim().toLowerCase());
  const today = new Date().toISOString().slice(0, 10);
  if (!p || !p.active) throw fail('This code is not valid.');
  if ((p.from && today < p.from) || (p.to && today > p.to)) throw fail('This code is not valid today.');
  if (p.maxUses && p.used >= p.maxUses) throw fail('This code has been used the maximum number of times.');
  if (p.packages?.length && !p.packages.includes(pkgId)) throw fail('This code does not apply to this package.');
  return p;
}

/** Manager only: a special discount for one customer, shown as its own line (BR-18). */
export function setSpecialDiscount(userId, d) {
  const u = getUserById(userId);
  const before = u.specialDiscount || null;
  const value = d ? { type: d.type, value: Number(d.value), cycles: Number(d.cycles || 0), used: 0, note: d.note || '', by: who(), at: iso() } : null;
  if (value && !(value.value > 0)) throw fail('Enter a discount value.');
  if (value?.type === 'percent' && value.value > 100) throw fail('A percentage must be between 1 and 100.');
  updateUser(userId, { specialDiscount: value });
  addAudit({ area: 'Billing', action: value ? 'Special discount set' : 'Special discount removed', entity: u.company?.name || u.email, before, after: value });
}

/** One discount per invoice: the manager's special discount wins over a promo code. */
function discountLine(user, lines, promo) {
  const pkgLine = lines.find((l) => l.kind === 'package');
  const setupLine = lines.find((l) => l.kind === 'setup');
  const sd = user?.specialDiscount;
  if (sd && (!sd.cycles || sd.used < sd.cycles)) {
    const base = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
    const amt = sd.type === 'percent' ? base * sd.value / 100 : Math.min(base, sd.value);
    return { line: { desc: { key: 'Special discount ({label})', vars: { label: sd.type === 'percent' ? `${sd.value}%` : formatMoney(sd.value) } }, amount: -(+amt.toFixed(2)), kind: 'discount' }, source: 'special' };
  }
  if (!promo) return null;
  let amt = 0;
  if (promo.type === 'percent') amt = (pkgLine?.amount || 0) * promo.value / 100;
  if (promo.type === 'amount') amt = Math.min(pkgLine?.amount || 0, promo.value);
  if (promo.type === 'freeMonths') amt = Math.min(pkgLine?.amount || 0, (pkgLine?.monthly || 0) * promo.value);
  if (promo.type === 'setupWaiver') amt = setupLine?.amount || 0;
  if (!amt) return null;
  return { line: { desc: { key: 'Offer {code}', vars: { code: promo.code } }, amount: -(+amt.toFixed(2)), kind: 'discount' }, source: 'promo', code: promo.code };
}

// ---------- Quote ----------
/** Lines and totals for a cart item. Card payments carry no surcharge (BR-24). */
export function quoteCart(cart, user) {
  if (!cart) return null;
  const lines = [];
  let promo = null;
  if (cart.type === 'package') {
    const pkg = getPackage(cart.packageId);
    const months = Number(cart.months || 1);
    const renewing = user?.subscription?.packageId === pkg.id && user?.subscription?.status === 'Active';
    lines.push({ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: months === 12 ? 'Annual' : 'Monthly' } }, amount: periodPrice(pkg, months), monthly: Number(pkg.price), kind: 'package' });
    const firstTime = !user?.setupPaid?.includes(pkg.setupFeeType === 'one-time' ? 'one-time' : 'annual');
    if (Number(pkg.setupFee) > 0 && !renewing && (pkg.setupFeeType === 'annual' || firstTime)) {
      lines.push({ desc: { key: 'Setup fee ({type})', vars: { type: pkg.setupFeeType === 'annual' ? 'annual' : 'one-time' } }, amount: Number(pkg.setupFee), kind: 'setup' });
    }
    if (cart.promo) promo = validatePromo(cart.promo, pkg.id);
  } else if (cart.type === 'upgrade') {
    const to = getPackage(cart.packageId);
    lines.push({ desc: { key: 'Upgrade to {name} · prorated for {days} days', vars: { name: to.name, days: cart.remainingDays } }, amount: Number(cart.price), kind: 'package' });
  }
  const d = discountLine(user, lines, promo);
  if (d) lines.push(d.line);
  const tt = totals(lines, { vatRate: VAT_RATE, included: PRICES_INCLUDE_VAT });
  return { lines, ...tt, rate: tt.vatRate, included: PRICES_INCLUDE_VAT, discount: d, subtotalBefore: lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0) };
}

export const bankTransferAllowed = (cart) => cart?.type === 'package' && (Number(cart.months) === 12 || getPackage(cart.packageId)?.custom);

// ---------- Saved card (INT-02) ----------
const brandOf = (num) => (/^4/.test(num) ? 'Visa' : /^5[1-5]/.test(num) ? 'Mastercard' : /^3[47]/.test(num) ? 'Amex' : 'Card');
export function tokenizeCard({ number, exp, name }) {
  const n = String(number || '').replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(n)) throw fail('Enter a valid card number.');
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp || '')) throw fail('Expiry must be MM/YY.');
  const [mm, yy] = exp.split('/').map(Number);
  if (new Date(2000 + yy, mm, 0) < new Date()) throw fail('This card has expired.');
  // In production the card fields are hosted by the payment gateway; the platform only receives this token.
  return { token: `tok_${Math.random().toString(36).slice(2, 14)}`, brand: brandOf(n), last4: n.slice(-4), exp, name: name || '', failNext: n.endsWith('0002') };
}
export function saveCard(userId, card) {
  const before = getUserById(userId)?.card || null;
  updateUser(userId, { card: { ...card, savedAt: iso() } });
  addAudit({ area: 'Billing', action: 'Saved card changed', entity: getUserById(userId)?.company?.name, before: before && `${before.brand} ••${before.last4}`, after: `${card.brand} ••${card.last4}` });
}
export function setAutoRenew(userId, on) {
  updateUser(userId, (u) => ({ subscription: { ...u.subscription, autoRenew: !!on, cancelAtPeriodEnd: !on } }));
  addAudit({ area: 'Billing', action: on ? 'Auto-renewal turned on' : 'Auto-renewal turned off (cancel at period end)', entity: getUserById(userId)?.company?.name, before: !on, after: !!on });
}

// ---------- Orders and checkout ----------
export const getOrders = () => read(ORDERS_KEY, []);
const saveOrders = (list) => write(ORDERS_KEY, list);

const paymentType = (user, cart) => (cart.type === 'upgrade' ? 'Upgrade' : user.subscription && user.subscription.packageId === cart.packageId && user.subscription.status === 'Active' ? 'Renewal' : 'New');

/**
 * Pay for a cart. Card: charged now. Bank transfer: an order waits for the manager's confirmation and
 * nothing is submitted until then (BR-12).
 */
export async function checkout(userId, cart, { method = 'Card', card = null, saveCardToo = true, bankRef = '' } = {}) {
  const user = getUserById(userId);
  if (!user) throw fail('User not found.');
  const q = quoteCart(cart, user);
  if (method === 'Bank transfer') {
    if (!bankTransferAllowed(cart)) throw fail('Bank transfer is available for annual and Enterprise subscriptions only.');
    await delay(500);
    const order = { id: `ORD-${String(getOrders().length + 3001)}`, userId, company: user.company?.name || user.fullName, cart, quote: q, method, bankRef, status: 'Awaiting payment confirmation', createdAt: iso() };
    saveOrders([order, ...getOrders()]);
    createTask({ type: 'bank-transfer', ref: { kind: 'order', id: order.id, name: `${order.id} · ${order.company}` }, note: `${formatMoney(q.total)} · ref ${bankRef || '—'}` });
    notify(userId, { level: 'info', key: 'Your order {id} is waiting for bank transfer confirmation.', vars: { id: order.id }, link: 'plan' });
    return { pending: true, order };
  }
  await delay(1200); // gateway
  const c = card || user.card;
  if (!c) throw fail('Add a card to pay.');
  if (c.failNext) throw fail('Your card was declined by the bank. Try another card.');
  if (saveCardToo && card) saveCard(userId, card);
  return finalize(userId, cart, q, { method: 'Card', paymentRef: `pi_${Math.random().toString(36).slice(2, 12)}`, card: c });
}

/** Manager confirms a bank transfer: the order is paid and processed exactly like a card payment. */
export async function confirmBankTransfer(orderId, ref) {
  const o = getOrders().find((x) => x.id === orderId);
  if (!o || o.status !== 'Awaiting payment confirmation') throw fail('Order not found.');
  if (!ref?.trim()) throw fail('Enter the bank reference you received.');
  const res = finalize(o.userId, o.cart, o.quote, { method: 'Bank transfer', paymentRef: ref });
  saveOrders(getOrders().map((x) => (x.id === orderId ? { ...x, status: 'Paid', confirmedAt: iso(), confirmedBy: who(), bankRef: ref, invoiceId: res.invoice.id } : x)));
  completeTasksFor(orderId);
  addAudit({ area: 'Billing', action: 'Bank transfer confirmed', entity: orderId, before: { status: o.status }, after: { status: 'Paid', ref } });
  return res;
}
export function cancelOrder(orderId, note) {
  saveOrders(getOrders().map((x) => (x.id === orderId ? { ...x, status: 'Cancelled', note, cancelledAt: iso() } : x)));
  completeTasksFor(orderId);
}

function finalize(userId, cart, q, { method, paymentRef }) {
  const user = getUserById(userId);
  const type = paymentType(user, cart);
  const pkg = getPackage(cart.packageId);
  const kind = type === 'Upgrade' ? 'Upgrade' : type === 'Renewal' ? 'Renewal' : 'Subscription';
  const invoice = issueInvoice({ customerId: userId, kind, lines: q.lines, method, paymentRef, status: 'Paid' });
  const current = user.subscription;
  let subscription = current;

  if (cart.type === 'package') {
    const months = Number(cart.months || 1);
    if (type === 'Renewal') {
      const end = new Date(current.endDate); end.setMonth(end.getMonth() + months);
      subscription = { ...current, endDate: iso(end), months, pendingChange: null };
    } else {
      const now = new Date(); const end = new Date(now); end.setMonth(end.getMonth() + months);
      subscription = withLegacy({
        packageId: pkg.id, packageName: pkg.name, months, billing: months === 12 ? 'Annual' : 'Monthly',
        priceMonthly: Number(pkg.price), priceAnnual: Number(pkg.annualPrice), overagePrice: Number(pkg.overagePrice),
        usersLimit: Number(pkg.users), entities: Number(pkg.entities), customQuota: pkg.custom ? Number(pkg.transactions) : undefined,
        status: 'Pending activation', paidAt: iso(now), startDate: iso(now), endDate: iso(end),
        autoRenew: true, cancelAtPeriodEnd: false, pendingChange: null, ledger: null, paymentId: paymentRef, total: q.total,
        transactionsLimit: 0, transactionsUsed: 0,
      });
    }
  } else if (cart.type === 'upgrade') {
    const from = getPackage(current.packageId);
    const ledger = current.ledger ? { ...current.ledger, monthQuota: current.ledger.monthQuota + Math.max(0, Number(pkg.transactions) - Number(from.transactions)) } : current.ledger;
    subscription = withLegacy({ ...current, packageId: pkg.id, packageName: pkg.name, priceMonthly: Number(pkg.price), priceAnnual: Number(pkg.annualPrice), overagePrice: Number(pkg.overagePrice), usersLimit: Number(pkg.users), entities: Number(pkg.entities), ledger, pendingChange: null });
  }

  const setupPaid = q.lines.some((l) => l.kind === 'setup') ? [...new Set([...(user.setupPaid || []), pkg.setupFeeType === 'one-time' ? 'one-time' : 'annual'])] : user.setupPaid;
  const payments = [...(user.payments || []), { id: paymentRef, date: iso(), type, packageId: pkg?.id || current?.packageId, invoiceId: invoice.id, method, description: { key: '{name} package · {months} month(s)', vars: { name: (pkg || getPackage(current.packageId)).name, months: cart.months || current?.months || 1 } }, total: q.total, vat: q.vat, vatRate: q.rate, status: 'Paid' }];
  const sd = user.specialDiscount && q.discount?.source === 'special' ? { ...user.specialDiscount, used: (user.specialDiscount.used || 0) + 1 } : user.specialDiscount;
  updateUser(userId, { subscription, payments, setupPaid, specialDiscount: sd });
  if (q.discount?.source === 'promo') write(PROMOS_KEY, getPromos().map((p) => (p.code === q.discount.code ? { ...p, used: (p.used || 0) + 1 } : p)));

  // Partner attribution from a referral link or code, captured before payment (BR-14).
  const u2 = getUserById(userId);
  if (!u2.partner) {
    const ref = u2.referral?.code ? partnerByCode(u2.referral.code) : null;
    const link = activeReferral();
    if (ref) attributeCustomer(userId, ref.id, u2.referral.method || 'Code');
    else if (link) attributeCustomer(userId, link.partnerId, 'Link');
  }
  commissionOnPayment(userId, { invoiceId: invoice.id, type, lines: q.lines });

  if (type === 'New') onPaid(userId);
  addLog({ type: 'transaction', userId, company: user.company?.name, action: 'Payment received', details: '{type} · {amount} · {method}', vars: { type, amount: formatMoney(q.total), method } });
  return { user: getUserById(userId), invoice, paymentId: paymentRef, total: q.total, type };
}

/** Upgrade now (BIL-07): prorated difference and its own invoice. Uses the shared quote (BR-07). */
export function upgradeCart(user, toPackageId) {
  const q = upgradeQuote(user.subscription, toPackageId);
  return { type: 'upgrade', packageId: toPackageId, price: q.amount, remainingDays: q.remainingDays };
}

// ---------- Renewal cycle (BIL-06, BIL-08, BR-05, BR-08) ----------
/**
 * Closes the current period and bills the next one. In production this runs on the renewal date;
 * the admin can run it now from Admin → Billing for a demo.
 */
export async function runRenewal(userId, { forceFail = false } = {}) {
  await delay(600);
  const u = getUserById(userId);
  const s = u?.subscription;
  if (!s || !s.ledger || stageOf(u) !== 'Active') throw fail('Only active subscriptions with a started year can renew.');
  let pkg = getPackage(s.packageId);
  // A scheduled downgrade starts with the new cycle.
  let changed = null;
  if (s.pendingChange) { changed = s.pendingChange; pkg = getPackage(s.pendingChange.packageId); }
  const closed = closePeriod(s.ledger, pkg);
  const annual = Number(s.months) === 12;
  const periodLabel = new Date(s.ledger.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const nextLabel = new Date(closed.ledger.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const lines = [];

  if (!s.autoRenew) {
    // Customer cancelled: the subscription ends; last month's overage is still billed.
    updateUser(userId, { subscription: { ...s, status: 'Cancelled', endedAt: iso() } });
    setStage(userId, 'Suspended', 'Subscription cancelled by the customer');
    if (closed.overage) lines.push({ desc: { key: 'Extra documents · {period}', vars: { period: periodLabel } }, period: periodLabel, qty: closed.overage, unitPrice: Number(s.overagePrice), amount: +(closed.overage * Number(s.overagePrice)).toFixed(2), kind: 'overage' });
    if (lines.length) issueInvoice({ customerId: userId, kind: 'Renewal', lines, method: 'Card', status: u.card ? 'Paid' : 'Unpaid' });
    return { ended: true };
  }

  if (!annual || closed.newYear) {
    lines.push({ desc: { key: '{name} package · {period}', vars: { name: pkg.name, period: annual ? 'Annual' : nextLabel } }, period: annual ? `${nextLabel} – 12 months` : nextLabel, amount: annual ? Number(s.priceAnnual ?? pkg.annualPrice) : Number(changed ? pkg.price : (s.priceMonthly ?? pkg.price)), monthly: Number(pkg.price), kind: 'package' });
  }
  if (closed.overage) lines.push({ desc: { key: 'Extra documents · {period}', vars: { period: periodLabel } }, period: periodLabel, qty: closed.overage, unitPrice: Number(s.overagePrice ?? pkg.overagePrice), amount: +(closed.overage * Number(s.overagePrice ?? pkg.overagePrice)).toFixed(2), kind: 'overage' });
  if (closed.newYear && pkg.setupFeeType === 'annual' && Number(pkg.setupFee) > 0) lines.push({ desc: { key: 'Annual setup fee · subscription year starting {date}', vars: { date: nextLabel } }, period: nextLabel, amount: Number(pkg.setupFee), kind: 'setup' });
  if (s.prorationCredit) lines.push({ desc: { key: 'First month prorated from the activation date' }, amount: -Number(s.prorationCredit), kind: 'credit' });
  const d = discountLine(u, lines, null);
  if (d) lines.push(d.line);

  const nextEnd = annual ? closed.ledger.yearEnd : closed.ledger.periodEnd;
  const base = withLegacy({ ...s, packageId: pkg.id, packageName: pkg.name, priceMonthly: changed ? Number(pkg.price) : s.priceMonthly, overagePrice: changed ? Number(pkg.overagePrice) : s.overagePrice, usersLimit: changed ? Number(pkg.users) : s.usersLimit, ledger: closed.ledger, endDate: nextEnd, prorationCredit: 0, pendingChange: null, lastRenewalAt: iso() });

  if (!lines.length || lines.reduce((x, l) => x + l.amount, 0) <= 0) {
    updateUser(userId, { subscription: base });
    return { invoice: null, paid: true, carried: closed.carried };
  }

  const card = u.card;
  const cardExpired = card && (() => { const [mm, yy] = card.exp.split('/').map(Number); return new Date(2000 + yy, mm, 0) < new Date(); })();
  const ok = card && !card.failNext && !cardExpired && !forceFail;
  const invoice = issueInvoice({ customerId: userId, kind: 'Renewal', lines, method: 'Card', paymentRef: ok ? `pi_${Math.random().toString(36).slice(2, 12)}` : '', status: ok ? 'Paid' : 'Unpaid' });
  const q = { total: invoice.total, vat: invoice.vat, rate: invoice.vatRate };
  const sd = d?.source === 'special' ? { ...u.specialDiscount, used: (u.specialDiscount.used || 0) + 1 } : u.specialDiscount;

  if (ok) {
    updateUser(userId, (x) => ({ subscription: { ...base, status: 'Active' }, specialDiscount: sd, payments: [...(x.payments || []), { id: invoice.paymentRef, date: iso(), type: 'Renewal', invoiceId: invoice.id, method: 'Card', description: { key: 'Renewal · {period}', vars: { period: nextLabel } }, total: q.total, vat: q.vat, vatRate: q.rate, status: 'Paid' }] }));
    commissionOnPayment(userId, { invoiceId: invoice.id, type: 'Renewal', lines });
    notify(userId, { level: 'success', key: 'Renewed: invoice {no} for {amount} was paid with your saved card.', vars: { no: invoice.id, amount: formatMoney(q.total) }, link: 'invoices-model' });
    return { invoice, paid: true, carried: closed.carried };
  }

  // Failed: 7 days' grace (sending continues), daily reminders and a follow-up task (BIL-08, BR-08).
  const graceDays = getPlatform().durations.graceDays;
  const graceUntil = iso(Date.now() + graceDays * 86400000);
  updateUser(userId, (x) => ({ subscription: { ...base, status: 'Past due', graceUntil, unpaidInvoice: invoice.id }, specialDiscount: sd, payments: [...(x.payments || []), { id: `fail_${invoice.id}`, date: iso(), type: 'Renewal', invoiceId: invoice.id, method: 'Card', description: { key: 'Renewal · {period}', vars: { period: nextLabel } }, total: q.total, status: 'Failed' }] }));
  sendTemplate('paymentFailed', { userId }, { days: graceDays, dedupe: `pf-${invoice.id}` }, { level: 'danger', link: 'plan' });
  createTask({ type: 'renewal-failed', ref: { kind: 'company', id: `${userId}:renew`, name: u.company?.name }, note: `${invoice.id} · ${formatMoney(q.total)}` });
  return { invoice, paid: false, graceUntil };
}

/** One day of grace passes (demo control). Daily reminder; suspension after the last day. */
export function graceTick(userId, { endNow = false } = {}) {
  const u = getUserById(userId);
  const s = u?.subscription;
  if (!s || s.status !== 'Past due') return null;
  if (endNow || new Date(s.graceUntil) <= new Date()) {
    suspend(userId);
    return 'suspended';
  }
  const left = Math.ceil((new Date(s.graceUntil) - Date.now()) / 86400000);
  notify(userId, { level: 'danger', key: 'Reminder: your renewal payment is still open. {days} day(s) left before suspension.', vars: { days: left }, link: 'plan' });
  return 'reminded';
}

/** Customer pays the open invoice (new card or saved card): resumes at once (BR-08). */
export async function payOpenInvoice(userId, docId, card = null) {
  await delay(1000);
  const u = getUserById(userId);
  const c = card || u.card;
  if (!c) throw fail('Add a card to pay.');
  if (c.failNext && !card) throw fail('Your card was declined by the bank. Try another card.');
  if (card) saveCard(userId, card);
  const ref = `pi_${Math.random().toString(36).slice(2, 12)}`;
  markPaid(docId, { method: 'Card', paymentRef: ref });
  const doc = docsOf(userId).find((d) => d.id === docId);
  updateUser(userId, (x) => ({
    subscription: { ...x.subscription, status: 'Active', graceUntil: null, unpaidInvoice: null },
    payments: [...(x.payments || []).map((p) => (p.invoiceId === docId && p.status === 'Failed' ? { ...p, status: 'Failed (paid later)' } : p)), { id: ref, date: iso(), type: 'Renewal', invoiceId: docId, method: 'Card', description: { key: 'Payment of invoice {id}', vars: { id: docId } }, total: doc?.total || 0, status: 'Paid' }],
  }));
  if (stageOf(u) === 'Suspended') resume(userId);
  completeTasksFor(`${userId}:renew`);
  commissionOnPayment(userId, { invoiceId: docId, type: 'Renewal', lines: doc?.lines || [] });
  return getUserById(userId);
}

/** Card expiring this month → reminder (NTF-02). */
export function checkCardExpiry() {
  const now = new Date();
  const mmyy = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(2)}`;
  getUsers().forEach((u) => {
    if (u.card?.exp === mmyy) sendTemplate('cardExpiry', { userId: u.id }, { month: mmyy, dedupe: `card-${mmyy}` }, { level: 'warning', link: 'plan' });
  });
}

// ---------- Enterprise (BIL-11) ----------
/**
 * Manager creates an Enterprise account after an off-platform contract: a custom package for this customer,
 * several entities, no automatic payment (manual invoice in the same series).
 */
export async function createEnterpriseAccount({ company, ownerName, email, phone, monthlyPrice, annualPrice, quota, users, entities, overagePrice, contractRef, months = 12, leadId }) {
  await delay(500);
  const em = String(email || '').trim().toLowerCase();
  if (!company || !ownerName || !/^\S+@\S+\.\S+$/.test(em)) throw fail('Fill in the company, the contact name and a valid email.');
  const all = getUsers();
  if (all.some((u) => u.email.toLowerCase() === em)) throw fail('An account with this email already exists.');
  const pkgId = `ent-${Date.now().toString(36)}`;
  const pkg = { id: pkgId, name: `Enterprise · ${company}`, custom: true, forCustomer: true, price: Number(monthlyPrice) || 0, annualPrice: Number(annualPrice) || 0, transactions: Number(quota) || 0, overagePrice: Number(overagePrice) || 0, setupFee: 0, setupFeeType: 'one-time', users: Number(users) || 10, entities: Number(entities) || 1, linkMethods: ['Billing portal (web)', 'ERP API', 'SFTP'], support: 'Account manager', consultingHours: 8, consultingDiscount: 25, features: [], active: false };
  write(CUSTOM_PACKAGES_KEY, [...read(CUSTOM_PACKAGES_KEY, []), pkg]);
  const tempPassword = `Ent-${Math.random().toString(36).slice(2, 8)}`;
  const id = crypto.randomUUID();
  const now = new Date(); const end = new Date(now); end.setMonth(end.getMonth() + Number(months));
  all.push({
    id, fullName: ownerName, email: em, phone: phone || '', password: tempPassword, role: 'Owner', createdAt: iso(), stage: 'Awaiting documents', mustChangePassword: true,
    company: { name: company, legalName: company, entities: Number(entities) || 1 },
    subscription: withLegacy({ packageId: pkgId, packageName: pkg.name, months: Number(months), billing: Number(months) === 12 ? 'Annual' : 'Monthly', priceMonthly: pkg.price, priceAnnual: pkg.annualPrice, overagePrice: pkg.overagePrice, usersLimit: pkg.users, entities: pkg.entities, customQuota: pkg.transactions, status: 'Pending activation', paidAt: null, startDate: iso(now), endDate: iso(end), autoRenew: false, contractRef, ledger: null, transactionsLimit: 0, transactionsUsed: 0 }),
    enterprise: { contractRef, leadId: leadId || null, createdBy: who() }, teamUsers: [], payments: [],
  });
  saveUsers(all);
  addAudit({ area: 'Billing', action: 'Enterprise account created', entity: company, before: null, after: { contractRef, monthlyPrice, annualPrice, quota, entities } });
  return { id, tempPassword };
}

/** Manager issues a manual invoice in the same series (INV-07), e.g. for an Enterprise contract. */
export function manualInvoice({ customerId, lines, contractRef, paymentRef, method = 'Bank transfer', paid = false }) {
  if (!contractRef?.trim()) throw fail('Enter the contract reference.');
  return issueInvoice({ customerId, kind: getUserById(customerId)?.enterprise ? 'Enterprise' : 'Manual', lines, method, paymentRef, status: paid ? 'Paid' : 'Unpaid', contractRef });
}
