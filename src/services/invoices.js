// Invoice transaction flow (diagram 2), simulated in the browser:
//   Input (Manual / Excel / API) → Validation → Package & user check → Queue
//   → Background processing (retry up to 10×, idempotent) → White Label → status & count update.
// In production this runs on the server; here a timer advances the queue so the flow can be seen live.

import { getUsers, saveUsers, updateUser, read, write, fail } from './api';
import { addLog } from './logs';
import { notify } from './notifications';
import { list, normalizeItem } from './masterData';
import { sendInvoice, getQvaliaConfig, sellerProblems, customerProblems, sellerSnapshot, buyerSnapshot } from './qvalia';
import { taxRate } from '../data/ubl';
import { standardRateOn } from './tax';

export const ACTIVE_STATUSES = ['Queued', 'Processing', 'Sent to White Label', 'Retrying'];
export const MAX_RETRIES = 10;
const SETTINGS_KEY = 'mei_settings';
const LOCK_KEY = 'mei_engine_lock';

export const DEFAULT_SETTINGS = { successRate: 0.85, phaseMs: 2500, retryMs: 6000, paused: false };
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) });
export const saveSettings = (patch) => write(SETTINGS_KEY, { ...getSettings(), ...patch });

const now = () => Date.now();
const iso = (t = now()) => new Date(t).toISOString();
const rand = (n) => Math.floor(Math.random() * n);
const pad = (n, w = 6) => String(n).padStart(w, '0');

// ---------- Totals ----------
// Computed per VAT category exactly like the UBL TaxTotal / LegalMonetaryTotal, so the app and
// the payload sent to Qvalia always agree. A document discount becomes one allowance per category.
export function computeTotals(items, opts = {}) {
  const { discountPct = 0 } = opts;
  const lines = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    const taxCategory = it.taxCategory || (Number(it.vatRate) === 0 ? 'Z' : 'S');
    // Category S uses the standard rate in force on the invoice issue date (the tax point).
    const vatRate = taxCategory === 'S' ? (opts.issueDate ? standardRateOn(opts.issueDate) : (Number.isFinite(Number(it.vatRate)) && Number(it.vatRate) > 0 ? Number(it.vatRate) : taxRate('S'))) : 0;
    const net = round(qty * price);
    return { ...it, qty, price, taxCategory, vatRate, net, vat: round(net * vatRate / 100) };
  });
  const pct = Number(discountPct) || 0;
  const map = new Map();
  lines.forEach((l) => {
    const key = `${l.taxCategory}|${l.vatRate}`;
    if (!map.has(key)) map.set(key, { taxCategory: l.taxCategory, rate: l.vatRate, net: 0 });
    map.get(key).net = round(map.get(key).net + l.net);
  });
  const groups = [...map.values()].map((g) => {
    const allowance = round(g.net * pct / 100);
    const taxable = round(g.net - allowance);
    return { ...g, allowance, taxable, tax: round(taxable * g.rate / 100) };
  });
  const subtotal = round(lines.reduce((a, l) => a + l.net, 0));
  const discount = round(groups.reduce((a, g) => a + g.allowance, 0));
  const vat = round(groups.reduce((a, g) => a + g.tax, 0));
  const total = round(subtotal - discount + vat);
  return { lines, groups, subtotal, discount, vat, total };
}
const round = (n) => Math.round(n * 100) / 100;

// ---------- Validation (diagram 2B) ----------
const ALLOWED_ROLES = ['Owner', 'Admin', 'Accountant'];
const VALID_CATEGORIES = ['S', 'Z', 'E', 'O'];

const findCustomer = (user, d) => list(user, 'customers').find((c) =>
  (d.customerId && c.id === d.customerId)
  || (d.customerTrn && c.trn === String(d.customerTrn))
  || (d.customerName && c.name.toLowerCase() === String(d.customerName).trim().toLowerCase()));

const findItem = (user, it) => list(user, 'products').find((p) =>
  (it.productId && p.id === it.productId)
  || (it.sku && p.sku && p.sku.toLowerCase() === String(it.sku).trim().toLowerCase())
  || (it.name && p.name.toLowerCase() === String(it.name).trim().toLowerCase()));

/** Returns a list of { key, vars } problems for one invoice draft. Empty = passed. */
export function validateInvoice(user, draft) {
  const errors = [];
  const add = (key, vars) => errors.push({ key, vars });

  // Invoice format
  if (!draft || !Array.isArray(draft.items)) { add('Invalid data format.'); return errors; }
  // Required fields
  if (!draft.customerId && !draft.customerName && !draft.customerTrn) add('Missing required field: customer.');
  if (!draft.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate)) add('Missing required field: issue date.');
  if (draft.dueDate && draft.issueDate && draft.dueDate < draft.issueDate) add('Due date cannot be before the issue date.');
  if (!draft.items.length) add('Add at least one item.');
  // Customer exists and is complete enough for e-invoicing
  const customer = findCustomer(user, draft);
  if ((draft.customerId || draft.customerName || draft.customerTrn) && !customer) {
    add('Customer not found: {name}', { name: draft.customerName || draft.customerTrn || draft.customerId });
  } else if (customer) {
    const missing = customerProblems(customer);
    if (missing.length) add('Customer {name} is missing: {fields}.', { name: customer.name, fields: missing.join(', '), translateFields: true });
  }
  // Items, quantities, prices, VAT
  draft.items.forEach((it, i) => {
    const n = i + 1;
    const product = findItem(user, it);
    if (!product) add('Line {n}: product or service not found ({name}).', { n, name: it.name || it.sku || it.productId || '—' });
    if (!(Number(it.qty) > 0)) add('Line {n}: quantity must be greater than 0.', { n });
    const price = it.price ?? product?.price;
    if (price === '' || price === null || price === undefined || !(Number(price) >= 0)) add('Line {n}: invalid price.', { n });
    const cat = it.taxCategory || product?.taxCategory;
    if (cat && !VALID_CATEGORIES.includes(cat)) add('Line {n}: VAT category must be S, Z, E or O.', { n });
    // Only check a bare VAT % (old API / Excel format). With a VAT category, the rate comes from the category and the issue date.
    if (!it.taxCategory && it.vatRate !== undefined && it.vatRate !== '' && ![0, standardRateOn(draft.issueDate)].includes(Number(it.vatRate))) add('Line {n}: VAT rate must be 0% or {rate}%.', { n, rate: standardRateOn(draft.issueDate) });
  });
  // Totals sent by API must match
  if (draft.expectedTotal !== undefined) {
    const { total } = computeTotals(draft.items.map((it) => ({ ...normalizeItem(findItem(user, it) || {}), ...it })), draft);
    if (Math.abs(total - Number(draft.expectedTotal)) > 0.01) add('Invalid VAT or totals: expected {expected}, calculated {calc}.', { expected: draft.expectedTotal, calc: total });
  }
  // Permissions & seller (company) data needed in the e-invoice
  if (!ALLOWED_ROLES.includes(user.role || 'Owner')) add('User permission issue: your role cannot create invoices.');
  sellerProblems(user.company).forEach((p) => add(p.key, p.vars));
  // Idempotency: same external reference cannot be sent twice
  if (draft.externalRef && (user.invoices || []).some((i) => i.externalRef === draft.externalRef && i.status !== 'Failed' && i.status !== 'Cancelled')) {
    add('Duplicate invoice reference {ref} (already submitted).', { ref: draft.externalRef });
  }
  return errors;
}

// ---------- Package & user check (diagram 2C) ----------
/** Returns null when OK, or { code, key, vars }. */
export function packageCheck(user, count = 1) {
  const s = user.subscription;
  if (!s) return { code: 'NO_PACKAGE', key: 'You need an active package to send invoices.' };
  if (s.locked) return { code: 'LOCKED', key: 'Your package is locked after a refund. New invoices are not allowed.' };
  if (new Date(s.endDate) < new Date()) return { code: 'EXPIRED', key: 'Your package has expired. Renew it to continue.' };
  const activeUsers = 1 + (user.teamUsers || []).filter((m) => m.status === 'Active').length;
  if (activeUsers > s.usersLimit) return { code: 'USERS', key: 'You have {n} active users but your package allows {max}. Deactivate users or upgrade.', vars: { n: activeUsers, max: s.usersLimit } };
  const inflight = (user.invoices || []).filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
  const left = Math.max(0, s.transactionsLimit - s.transactionsUsed - inflight);
  if (left < count) return { code: 'LIMIT', key: 'You have reached your transaction limit. {left} left, {count} requested.', vars: { left, count } };
  return null;
}

// ---------- Create (diagram 2A → 2D) ----------
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString().slice(0, 10); };

/**
 * Validates and queues invoices. Returns { created: [...], rejected: [{ index, ref, errors }], blocked }.
 * `blocked` is set when the package check fails for the whole batch.
 */
export function createInvoices(userId, drafts, source = 'Manual') {
  const user = getUsers().find((u) => u.id === userId);
  if (!user) throw fail('User not found.');

  const results = drafts.map((d, index) => ({ index, draft: d, errors: validateInvoice(user, d) }));
  const valid = results.filter((r) => !r.errors.length);
  const rejected = results.filter((r) => r.errors.length).map((r) => ({ index: r.index, ref: r.draft.externalRef, errors: r.errors, draft: r.draft }));

  if (!valid.length) {
    addLog({ type: 'error', userId, company: user.company?.name, action: 'Validation failed', details: '{n} invoice(s) rejected ({source})', vars: { n: rejected.length, source } });
    return { created: [], rejected, blocked: null };
  }
  const blocked = packageCheck(user, valid.length);
  if (blocked) {
    addLog({ type: 'error', userId, company: user.company?.name, action: 'Package check failed', details: blocked.key, vars: blocked.vars });
    return { created: [], rejected, blocked };
  }

  const seller = sellerSnapshot(user);
  let seq = user.invoiceSeq || 1000;
  const created = valid.map(({ draft }) => {
    seq += 1;
    const customer = findCustomer(user, draft);
    const items = draft.items.map((it) => {
      const p = normalizeItem(findItem(user, it));
      const taxCategory = it.taxCategory || (it.vatRate !== undefined && it.vatRate !== '' && Number(it.vatRate) === 0 && p.taxCategory === 'S' ? 'Z' : p.taxCategory);
      return {
        productId: p.id, name: p.name, description: it.description ?? p.description, sku: p.sku, gtin: p.gtin,
        unitCode: it.unitCode || p.unitCode, qty: Number(it.qty), price: Number(it.price ?? p.price),
        taxCategory, vatRate: taxCategory === 'S' ? standardRateOn(draft.issueDate) : taxRate(taxCategory),
        classificationList: p.classificationList, classificationCode: p.classificationCode, originCountry: p.originCountry,
      };
    });
    const totals = computeTotals(items, { ...draft, issueDate: draft.issueDate });
    const t = iso();
    const paymentDays = draft.paymentDays ?? customer.paymentDays ?? 30;
    return {
      id: `INV-${seq}`,
      queueId: `Q${pad(100000 + rand(899999))}`,
      idempotencyKey: `${userId}:${draft.externalRef || seq}`,
      externalRef: draft.externalRef || null,
      source,
      currency: 'AED',
      customerId: customer.id,
      customerName: customer.name,
      customerTrn: customer.trn || '',
      issueDate: draft.issueDate,
      dueDate: draft.dueDate || addDays(draft.issueDate, paymentDays),
      deliveryDate: draft.deliveryDate || null,
      buyerReference: draft.buyerReference || customer.buyerReference || '',
      orderReference: draft.orderReference || '',
      paymentTerms: draft.paymentTerms || (paymentDays ? `Payment within ${paymentDays} days` : ''),
      notes: draft.notes || '',
      discountPct: Number(draft.discountPct) || 0,
      seller,
      buyer: buyerSnapshot(customer),
      items: totals.lines,
      subtotal: totals.subtotal, discount: totals.discount, vat: totals.vat, total: totals.total,
      status: 'Queued', retryCount: 0, phaseAt: now(), nextAttemptAt: null,
      wlInvoiceId: null, wlResponse: null, lastError: null,
      history: [{ status: 'Queued', at: t, note: 'Validation passed. Added to queue.' }],
      createdAt: t,
    };
  });

  updateUser(userId, (u) => ({ invoices: [...created, ...(u.invoices || [])], invoiceSeq: seq }));
  created.forEach((inv) => addLog({ type: 'transaction', userId, company: user.company?.name, action: 'Invoice queued', details: '{id} · {queue} · {source}', vars: { id: inv.id, queue: inv.queueId, source } }));
  return { created, rejected, blocked: null };
}

// ---------- Manual actions ----------
export function retryInvoice(userId, invoiceId, by = 'customer') {
  updateUser(userId, (u) => ({
    invoices: (u.invoices || []).map((i) => (i.id === invoiceId && ['Failed', 'Cancelled'].includes(i.status)
      ? { ...i, status: 'Queued', retryCount: 0, phaseAt: now(), nextAttemptAt: null, lastError: null, history: [...i.history, { status: 'Queued', at: iso(), note: by === 'admin' ? 'Re-queued by administrator.' : 'Re-queued manually.' }] }
      : i)),
  }));
}

export function cancelInvoice(userId, invoiceId) {
  updateUser(userId, (u) => ({
    invoices: (u.invoices || []).map((i) => (i.id === invoiceId && ['Queued', 'Retrying'].includes(i.status)
      ? { ...i, status: 'Cancelled', history: [...i.history, { status: 'Cancelled', at: iso(), note: 'Cancelled before sending.' }] }
      : i)),
  }));
}

// ---------- Background processor (diagram 2E–2G) ----------
// Each tick advances invoices one step. The White Label step calls Qvalia (simulated or live via
// the backend proxy) asynchronously; the result is written back when it arrives.
const TAB_ID = Math.random().toString(36).slice(2);
const inFlight = new Set();

function haveLock() {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (!lock || lock.tab === TAB_ID || now() - lock.at > 5000) {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tab: TAB_ID, at: now() }));
      return true;
    }
  } catch { return true; }
  return false;
}

function thresholdNotices(user, sub) {
  const inflight = (user.invoices || []).filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
  const left = Math.max(0, sub.transactionsLimit - sub.transactionsUsed - inflight);
  const pct = sub.transactionsLimit ? left / sub.transactionsLimit : 0;
  const period = sub.startDate.slice(0, 10);
  if (left === 0) notify(user.id, { level: 'danger', key: 'You have used all invoices in your package. Renew or buy an add-on to continue.', link: 'addon', dedupe: `lim0-${period}-${sub.transactionsLimit}` });
  else if (pct <= 0.1) notify(user.id, { level: 'danger', key: 'Only {left} invoices left in your package.', vars: { left }, link: 'addon', dedupe: `lim10-${period}-${sub.transactionsLimit}` });
  else if (pct <= 0.2) notify(user.id, { level: 'warning', key: '{left} invoices left in your package.', vars: { left }, link: 'addon', dedupe: `lim20-${period}-${sub.transactionsLimit}` });
}

/** Write the Qvalia result back to the invoice (fresh read: the user may have changed meanwhile). */
function applyResult(userId, invId, res) {
  const settings = getSettings();
  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return;
  const inv = (user.invoices || []).find((i) => i.id === invId);
  if (!inv || inv.status !== 'Sent to White Label') return; // cancelled meanwhile
  const t = now();
  const response = { http: res.http, body: res.body, at: iso(t) };
  let next;
  if (res.ok) {
    next = {
      ...inv, status: 'Success', phaseAt: t, wlInvoiceId: res.integrationId || inv.id, wlResponse: response, lastError: null,
      history: [...inv.history, { status: 'Success', at: iso(t), note: 'Qvalia accepted the invoice (HTTP {http}). Integration ID {wl}.', vars: { http: res.http, wl: res.integrationId || '—' } }],
    };
    if (user.subscription) user.subscription = { ...user.subscription, transactionsUsed: user.subscription.transactionsUsed + 1 };
  } else {
    const retryCount = (inv.retryCount || 0) + 1;
    const permanent = !res.retry;
    if (permanent || retryCount >= MAX_RETRIES) {
      next = {
        ...inv, status: 'Failed', phaseAt: t, retryCount, lastError: res.error, wlResponse: response,
        history: [...inv.history, { status: 'Failed', at: iso(t), note: permanent ? 'Rejected by Qvalia: {err}' : 'Failed after {max} attempts: {err}', vars: { max: MAX_RETRIES, err: res.error } }],
      };
    } else {
      const wait = res.body?.metadata?.retryAfter ? Math.max(settings.retryMs, res.body.metadata.retryAfter * 100) : settings.retryMs;
      next = {
        ...inv, status: 'Retrying', phaseAt: t, retryCount, lastError: res.error, wlResponse: response, nextAttemptAt: t + wait,
        history: [...inv.history, { status: 'Retrying', at: iso(t), note: 'No success ({err}). Retry {n} of {max} scheduled.', vars: { err: res.error, n: retryCount, max: MAX_RETRIES } }],
      };
    }
  }
  user.invoices = user.invoices.map((i) => (i.id === invId ? next : i));
  saveUsers(users);

  const company = user.company?.name;
  if (res.ok) {
    addLog({ type: 'wl', userId, company, action: 'Qvalia response {http}', vars: { http: res.http }, details: '{id} → {wl}', at: iso(t) });
    if (user.subscription) thresholdNotices(user, user.subscription);
  } else {
    addLog({ type: 'error', userId, company, action: 'Qvalia error', details: '{id} · {err} · attempt {n}', vars: { id: invId, err: res.error, n: next.retryCount } });
    if (next.status === 'Failed') notify(userId, { level: 'danger', key: 'Invoice {id} failed after {max} attempts ({err}).', vars: { id: invId, max: MAX_RETRIES, err: res.error }, link: 'invoices', dedupe: `fail-${invId}-${next.history.length}` });
  }
}

export function tick() {
  const settings = getSettings();
  if (settings.paused || !haveLock()) return;
  const users = getUsers();
  let changed = false;
  const t = now();
  const after = [];

  users.forEach((user) => {
    if (!user.invoices || !user.invoices.length) return;
    const locked = user.subscription?.locked;
    user.invoices = user.invoices.map((inv) => {
      if (!ACTIVE_STATUSES.includes(inv.status)) return inv;
      const push = (status, extra = {}, note, vars) => {
        changed = true;
        return { ...inv, ...extra, status, phaseAt: t, history: [...inv.history, { status, at: iso(t), note, vars }] };
      };
      if (locked) return push('Cancelled', {}, 'Cancelled: package refunded.');

      const elapsed = t - (inv.phaseAt || 0);
      switch (inv.status) {
        case 'Queued':
          if (elapsed < settings.phaseMs) return inv;
          after.push(() => addLog({ type: 'transaction', userId: user.id, company: user.company?.name, action: 'Picked by background process', details: '{id} · {queue}', vars: { id: inv.id, queue: inv.queueId } }));
          return push('Processing', {}, 'Picked by the background process. UBL invoice built for Qvalia.');
        case 'Retrying':
          if (t < (inv.nextAttemptAt || 0)) return inv;
          return push('Processing', {}, 'Retry attempt {n} of {max}.', { n: inv.retryCount, max: MAX_RETRIES });
        case 'Processing': {
          if (elapsed < settings.phaseMs) return inv;
          const cfg = getQvaliaConfig();
          const next = push('Sent to White Label', {}, 'POST to Qvalia /invoices/outgoing ({format}, Idempotency-Key).', { format: cfg.format.toUpperCase() });
          after.push(() => {
            addLog({ type: 'wl', userId: user.id, company: user.company?.name, action: 'Request sent to Qvalia', details: 'POST /transaction/{acct}/invoices/outgoing · {id} · {format}', vars: { id: inv.id, acct: cfg.accountRegNo || '{accountRegNo}', format: cfg.format.toUpperCase() } });
            const key = `${user.id}:${inv.id}:${next.history.length}`;
            if (inFlight.has(key)) return;
            inFlight.add(key);
            sendInvoice(next, { successRate: settings.successRate, cfg })
              .then((res) => applyResult(user.id, inv.id, res))
              .catch((e) => applyResult(user.id, inv.id, { ok: false, retry: true, http: 0, error: e.message }))
              .finally(() => inFlight.delete(key));
          });
          return next;
        }
        case 'Sent to White Label':
          // Waiting for Qvalia. If the tab was closed mid-request, re-send (same Idempotency-Key → no duplicate).
          if (elapsed > 60000 && ![...inFlight].some((k) => k.startsWith(`${user.id}:${inv.id}:`))) {
            return push('Retrying', { nextAttemptAt: t }, 'No response recorded. Re-sending with the same Idempotency-Key.');
          }
          return inv;
        default:
          return inv;
      }
    });
  });

  if (changed) {
    saveUsers(users);
    after.forEach((fn) => fn());
  }
}

let timer = null;
export function startEngine() {
  if (timer) return;
  timer = setInterval(() => { try { tick(); } catch (e) { console.error(e); } }, 1000);
}
