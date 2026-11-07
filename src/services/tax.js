// VAT settings managed by the system admin, as a schedule of rates with effective dates.
// - billingRate: VAT charged on our own sales (packages, renewals, upgrades, add-ons).
// - standardRate: rate of VAT category S on customers' e-invoices (UAE standard rate is 5%).
// A change can start today or on a future date. Payments use the rate in force when they are paid;
// e-invoices use the rate in force on their issue date. Past payments and sent invoices never change.
import { setVatRate, setPricesIncludeVat } from '../data/packages';
import { TAX_CATEGORIES } from '../data/ubl';

export const TAX_KEY = 'mei_tax';
export const TAX_HISTORY_KEY = 'mei_tax_history';
export const UAE_VAT_START = '2018-01-01';
const RATE_FIELDS = ['registered', 'billingRate', 'pricesIncludeVat', 'standardRate'];
export const DEFAULT_RATES = { registered: true, billingRate: 5, pricesIncludeVat: false, standardRate: 5 };
export const DEFAULT_SELLER = { sellerName: 'ModelFC Technologies L.L.C', sellerTrn: '100456789000003', sellerAddress: 'Office 2104, Business Bay, Dubai, UAE' };
export const DEFAULT_TAX = { ...DEFAULT_RATES, ...DEFAULT_SELLER };

const readJson = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayOf = (date) => (date ? String(typeof date === 'string' ? date : new Date(date).toISOString()).slice(0, 10) : todayStr());

/** Stored shape: { seller fields, periods: [{ id, from, ...rates, createdAt, by }] } (older flat shape is upgraded). */
function store() {
  const raw = readJson(TAX_KEY, {});
  if (Array.isArray(raw.periods) && raw.periods.length) return raw;
  const rates = Object.fromEntries(RATE_FIELDS.map((k) => [k, raw[k] ?? DEFAULT_RATES[k]]));
  return { ...DEFAULT_SELLER, ...Object.fromEntries(Object.keys(DEFAULT_SELLER).filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]])), periods: [{ id: 'P-base', from: UAE_VAT_START, ...rates, createdAt: null, by: 'System' }] };
}

export const getPeriods = () => [...store().periods].sort((a, b) => a.from.localeCompare(b.from));
/** The rate period in force on a date (YYYY-MM-DD or Date). */
export const periodOn = (date) => { const d = dayOf(date); const ps = getPeriods(); return [...ps].reverse().find((p) => p.from <= d) || ps[0]; };
export const upcomingPeriods = () => getPeriods().filter((p) => p.from > todayStr());

/** Settings in force today (plus seller details). */
export const getTax = () => { const s = store(); const p = periodOn(); return { ...DEFAULT_TAX, sellerName: s.sellerName, sellerTrn: s.sellerTrn, sellerAddress: s.sellerAddress, ...Object.fromEntries(RATE_FIELDS.map((k) => [k, p[k]])), from: p.from }; };
export const getTaxHistory = () => readJson(TAX_HISTORY_KEY, []);
/** VAT % charged on our sales on a date (0 when not VAT registered). */
export const billingRate = (date) => { const p = periodOn(date); return p.registered ? Number(p.billingRate) : 0; };
/** Standard (S) rate on e-invoices on a date — use the invoice issue date. */
export const standardRateOn = (date) => Number(periodOn(date).standardRate);

/** Push today's settings into the modules that calculate prices and invoices. */
export function applyTax() {
  const x = getTax();
  setVatRate(x.registered ? Number(x.billingRate) / 100 : 0);
  setPricesIncludeVat(!!x.pricesIncludeVat && !!x.registered);
  const s = TAX_CATEGORIES.find((c) => c.code === 'S');
  if (s) s.rate = Number(x.standardRate);
}

export function validateTax(x) {
  const errs = {};
  const pct = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
  if (!pct(x.billingRate)) errs.billingRate = 'Enter a rate between 0 and 100.';
  if (!pct(x.standardRate) || Number(x.standardRate) === 0) errs.standardRate = 'Enter a rate above 0 and up to 100. Use category Z for zero-rated items.';
  if (x.registered && !/^\d{15}$/.test(String(x.sellerTrn || ''))) errs.sellerTrn = 'TRN must be 15 digits.';
  if (!String(x.sellerName || '').trim()) errs.sellerName = 'Name is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.from || ''))) errs.from = 'Choose a start date.';
  else if (x.from < todayStr()) errs.from = 'The start date cannot be in the past. Past payments and invoices keep their VAT.';
  return errs;
}

const LABEL = { registered: 'VAT registered', billingRate: 'VAT on our sales', pricesIncludeVat: 'Prices include VAT', standardRate: 'Standard rate on e-invoices', sellerName: 'Legal name', sellerTrn: 'TRN', sellerAddress: 'Address' };
const notify = () => { applyTax(); try { window.dispatchEvent(new CustomEvent('mei-db-change', { detail: { key: TAX_KEY } })); } catch { /* ignore */ } };

/**
 * Save settings. Rate fields start on `next.from` (today or later): a new period is added, or the
 * period starting that day is replaced. Seller details apply immediately.
 */
export function saveTax(next, by = 'System admin') {
  const s = store();
  const from = next.from || todayStr();
  const base = periodOn(from); // what applies on that date before this change
  const rates = { registered: !!next.registered, billingRate: Number(next.billingRate), pricesIncludeVat: !!next.pricesIncludeVat, standardRate: Number(next.standardRate) };
  const rateChanges = RATE_FIELDS.filter((k) => base[k] !== rates[k]).map((k) => ({ field: LABEL[k], from: base[k], to: rates[k] }));
  const seller = { sellerName: String(next.sellerName || '').trim(), sellerTrn: String(next.sellerTrn || '').trim(), sellerAddress: String(next.sellerAddress || '').trim() };
  const sellerChanges = Object.keys(seller).filter((k) => s[k] !== seller[k]).map((k) => ({ field: LABEL[k], from: s[k], to: seller[k] }));

  let periods = s.periods;
  if (rateChanges.length) {
    const p = { id: `P-${Date.now().toString(36)}`, from, ...rates, createdAt: new Date().toISOString(), by };
    periods = [...periods.filter((x) => x.from !== from), p];
  }
  writeJson(TAX_KEY, { ...seller, periods });
  const entries = [];
  if (rateChanges.length) entries.push({ at: new Date().toISOString(), by, effective: from, changes: rateChanges });
  if (sellerChanges.length) entries.push({ at: new Date().toISOString(), by, effective: todayStr(), changes: sellerChanges });
  if (entries.length) writeJson(TAX_HISTORY_KEY, [...entries, ...getTaxHistory()].slice(0, 50));
  notify();
  return { rateChanges, sellerChanges, from };
}

/** Remove a change that has not started yet. */
export function cancelPeriod(id, by = 'System admin') {
  const s = store();
  const p = s.periods.find((x) => x.id === id);
  if (!p || p.from <= todayStr()) return false;
  writeJson(TAX_KEY, { ...s, periods: s.periods.filter((x) => x.id !== id) });
  writeJson(TAX_HISTORY_KEY, [{ at: new Date().toISOString(), by, effective: p.from, cancelled: true, changes: [{ field: 'Scheduled change cancelled', from: p.from, to: '' }] }, ...getTaxHistory()].slice(0, 50));
  notify();
  return true;
}

/** Split an amount into net + VAT for display, honouring "prices include VAT". */
export function splitVat(amount, rate = billingRate(), included = getTax().pricesIncludeVat) {
  const r = Number(rate) / 100;
  if (included) { const net = +(amount / (1 + r)).toFixed(2); return { net, vat: +(amount - net).toFixed(2), total: +amount }; }
  const vat = +(amount * r).toFixed(2);
  return { net: +amount, vat, total: +(amount + vat).toFixed(2) };
}

applyTax();
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === TAX_KEY) applyTax(); });
  // A scheduled change starts at midnight even if the app stays open.
  let day = todayStr();
  setInterval(() => { if (todayStr() !== day) { day = todayStr(); notify(); } }, 60000);
}
