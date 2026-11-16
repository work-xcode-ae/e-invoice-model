// Usage ledger (BIL-04, BR-01..BR-03).
// Order of consumption: free yearly allowance → this month's quota → carried-over balance → overage.
//  - 100 free documents per subscription year, used first, never carried to the next year.
//  - Unused monthly quota carries over until the end of the subscription year, then lapses.
//  - Sending never stops at the limit (BIL-05): extra documents are overage, billed on the next renewal invoice.
//  - Only sent documents count; an invoice or a credit note is one document; received documents do not count.
import { getPackage, FREE_DOCS_PER_YEAR } from '../data/packages';
import { read } from './api';

const iso = (d) => new Date(d).toISOString();
const freeDocs = () => {
  const s = read('mei_platform', {});
  return Number(s?.durations?.freeDocs ?? FREE_DOCS_PER_YEAR);
};

export const endOfMonth = (d) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth() + 1, 0, 23, 59, 59); };
export const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const daysIn = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0).getDate();

/**
 * New ledger at activation (BR-06): the subscription year starts on the activation date and the first
 * month is prorated to the end of the calendar month. Later periods run month by month.
 */
export function newLedger(pkgOrQuota, activatedAt = new Date()) {
  const quota = typeof pkgOrQuota === 'number' ? pkgOrQuota : Number(pkgOrQuota?.transactions || 0);
  const start = new Date(activatedAt);
  const periodEnd = endOfMonth(start);
  const share = (daysIn(start) - start.getDate() + 1) / daysIn(start);
  return {
    yearStart: iso(start),
    yearEnd: iso(addMonths(start, 12)),
    freeTotal: freeDocs(),
    freeUsed: 0,
    periodStart: iso(start),
    periodEnd: iso(periodEnd),
    firstPeriodShare: +share.toFixed(4),
    monthQuota: Math.round(quota * share),
    monthUsed: 0,
    carry: 0,
    carryUsed: 0,
    overage: 0,
    sentTotal: 0,
    lastSync: iso(new Date()),
  };
}

/** Uses `n` documents in the BR-02 order. Returns the updated ledger (never blocks). */
export function consume(ledger, n = 1) {
  const l = { ...ledger };
  let left = n;
  const take = (avail) => { const k = Math.min(avail, left); left -= k; return k; };
  l.freeUsed += take(Math.max(0, l.freeTotal - l.freeUsed));
  l.monthUsed += take(Math.max(0, l.monthQuota - l.monthUsed));
  l.carryUsed += take(Math.max(0, l.carry - l.carryUsed));
  l.overage += left;
  l.sentTotal = (l.sentTotal || 0) + n;
  return l;
}

/**
 * Closes the current month: unused quota is carried over (until year end), overage is returned for billing.
 * Starts a new subscription year when the old one has ended (free allowance resets, carry-over lapses).
 */
export function closePeriod(ledger, pkg) {
  const l = { ...ledger };
  const overage = l.overage;
  const unused = Math.max(0, l.monthQuota - l.monthUsed);
  const nextStart = new Date(new Date(l.periodEnd).getTime() + 1000);
  const newYear = nextStart >= new Date(l.yearEnd);
  if (newYear) {
    l.yearStart = iso(nextStart);
    l.yearEnd = iso(addMonths(nextStart, 12));
    l.freeTotal = freeDocs(); l.freeUsed = 0;
    l.carry = 0; l.carryUsed = 0;
  } else {
    l.carry = Math.max(0, l.carry - l.carryUsed) + unused;
    l.carryUsed = 0;
  }
  l.periodStart = iso(nextStart);
  l.periodEnd = iso(endOfMonth(nextStart));
  l.monthQuota = Number(pkg?.transactions || 0);
  l.monthUsed = 0;
  l.overage = 0;
  l.firstPeriodShare = 1;
  return { ledger: l, overage, newYear, carried: newYear ? 0 : unused };
}

/** Numbers for the usage dashboard (CUS-01). */
export function usageSummary(sub) {
  const l = sub?.ledger;
  if (!l) return null;
  const pkg = getPackage(sub.packageId);
  const free = { total: l.freeTotal, used: l.freeUsed, left: Math.max(0, l.freeTotal - l.freeUsed) };
  const month = { total: l.monthQuota, used: l.monthUsed, left: Math.max(0, l.monthQuota - l.monthUsed) };
  const carry = { total: l.carry, used: l.carryUsed, left: Math.max(0, l.carry - l.carryUsed), expires: l.yearEnd };
  const allowance = free.total + month.total + carry.total;
  const used = free.used + month.used + carry.used;
  const overagePrice = Number(sub.overagePrice ?? pkg?.overagePrice ?? 0);
  return {
    free, month, carry,
    overage: { count: l.overage, price: overagePrice, amount: +(l.overage * overagePrice).toFixed(2) },
    allowance, used, left: Math.max(0, allowance - used), pct: allowance ? (used + l.overage) / allowance : (l.overage ? 1 : 0),
    periodStart: l.periodStart, periodEnd: l.periodEnd, yearStart: l.yearStart, yearEnd: l.yearEnd,
    lastSync: l.lastSync, sentTotal: l.sentTotal || 0,
  };
}

/**
 * Keeps the old fields (transactionsLimit / transactionsUsed) in step with the ledger, so the admin
 * tables and reports written before BRD v1.1 still show sensible numbers.
 */
export function withLegacy(sub) {
  const u = usageSummary(sub);
  if (!u) return sub;
  return { ...sub, transactionsLimit: u.allowance, transactionsUsed: u.used + sub.ledger.overage };
}
