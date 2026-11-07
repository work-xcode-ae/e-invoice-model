// Reporting for the system admin (sales, companies, invoices) and for each customer company.
import { customers } from './admin';
import { getPackage, periodPrice } from '../data/packages';
import { ACTIVE_STATUSES } from './invoices';
import { read, write } from './api';
import { billingRate } from './tax';

/** Amount without VAT for a stored payment (uses the VAT it was charged; older payments were 5%). */
const exVat = (p) => (p.vat !== undefined ? p.total - p.vat : p.total / (1 + (p.vatRate ?? 5) / 100));

// ---------------- Costs (for profit) ----------------
export const FINANCE_KEY = 'mei_finance';
export const DEFAULT_FINANCE = { deliveryCost: 0.35, gatewayPct: 2.9, gatewayFixed: 1, monthlyFixed: 500 };
export const getFinance = () => ({ ...DEFAULT_FINANCE, ...read(FINANCE_KEY, {}) });
export const saveFinance = (f) => write(FINANCE_KEY, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v) || 0])));


export const RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: '12m', label: 'Last 12 months', days: 365 },
];
export const rangeStart = (id) => { const r = RANGES.find((x) => x.id === id) || RANGES[1]; const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - r.days + 1); return d; };
const inRange = (iso, from, to = null) => { const d = new Date(iso); return d >= from && (!to || d <= to); };

// ---------- Date ranges: a preset id ('30d', '12m'…) or custom { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } ----------
export const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const endOfDay = (d) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };
/** Current month: the 1st until today. */
export const thisMonth = () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), n.getMonth(), 1)), to: dayStr(n) }; };
export const DATE_PRESETS = [
  { id: 'thisMonth', label: 'This month', get: thisMonth },
  { id: 'lastMonth', label: 'Last month', get: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: dayStr(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  { id: 'last3', label: 'Last 3 months', get: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), n.getMonth() - 2, 1)), to: dayStr(n) }; } },
  { id: 'thisYear', label: 'This year', get: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), 0, 1)), to: dayStr(n) }; } },
  { id: 'last12', label: 'Last 12 months', get: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), n.getMonth() - 11, 1)), to: dayStr(n) }; } },
];
/** { from: Date (00:00), to: Date (23:59:59) } for a preset id or a custom range. */
export function resolveRange(r) {
  if (r && typeof r === 'object') {
    let a = parseDay(r.from); let b = parseDay(r.to);
    if (a > b) [a, b] = [b, a];
    return { from: a, to: endOfDay(b) };
  }
  return { from: rangeStart(r), to: endOfDay(new Date()) };
}
export const rangeKey = (r) => (r && typeof r === 'object' ? `${r.from}_${r.to}` : String(r));
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const monthKey = (d) => new Date(d).toISOString().slice(0, 7);

/** Last N calendar months as [{ key: 'YYYY-MM', date }], oldest first. */
export function lastMonths(n = 12) {
  const out = [];
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) { const m = new Date(d); m.setMonth(m.getMonth() - i); out.push({ key: monthKey(m), date: m.toISOString() }); }
  return out;
}

/** Buckets for a range: days for ≤ 30 days, weeks for 90 days, months for 12 months. */
export function buckets(range) {
  if (range === '12m') return { unit: 'month', list: lastMonths(12).map((m) => ({ ...m, from: new Date(m.date), to: (() => { const e = new Date(m.date); e.setMonth(e.getMonth() + 1); return e; })() })) };
  const { from, to } = resolveRange(range);
  const days = Math.round((to - from) / 86400000);
  if (days > 120) { // months
    const list = [];
    for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m <= to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      list.push({ key: dayStr(m).slice(0, 7), date: m.toISOString(), from: m < from ? from : m, to: next });
    }
    return { unit: 'month', list };
  }
  const step = days > 31 ? 7 : 1;
  const list = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)) {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
    list.push({ key: dayStr(d), date: d.toISOString(), from: new Date(d), to: end > to ? new Date(to.getTime() + 1) : end });
  }
  return { unit: step === 7 ? 'week' : 'day', list };
}
const bucketOf = (b, iso) => { const t = new Date(iso); return b.list.findIndex((x) => t >= x.from && t < x.to); };

// ---------------- Companies ----------------
const subStatus = (s) => (!s ? 'No package' : s.locked ? 'Refunded (Locked)' : new Date(s.endDate) < new Date() ? 'Expired' : s.status);

/** One row per customer company with invoice, usage and revenue statistics. */
export function companyStats() {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  return customers().map((u) => {
    const s = u.subscription;
    const inv = u.invoices || [];
    const by = (st) => inv.filter((i) => i.status === st).length;
    const success = by('Success'); const failed = by('Failed');
    const pays = u.payments || [];
    const status = subStatus(s);
    return {
      userId: u.id, company: u.company?.name || u.fullName, trn: u.company?.trn || '', emirate: u.company?.emirate || '',
      owner: u.fullName, email: u.email, createdAt: u.createdAt, active: !u.disabled,
      packageId: s?.packageId || null, packageName: s?.packageName || null, status,
      used: s?.transactionsUsed || 0, limit: s?.transactionsLimit || 0, usedPct: s?.transactionsLimit ? (s.transactionsUsed / s.transactionsLimit) * 100 : 0,
      users: 1 + (u.teamUsers || []).filter((m) => m.status === 'Active').length, usersLimit: s?.usersLimit || 0,
      endDate: s?.endDate || null,
      invoices: inv.length, success, failed, cancelled: by('Cancelled'),
      inProgress: inv.filter((i) => ACTIVE_STATUSES.includes(i.status)).length,
      successRate: success + failed ? (success / (success + failed)) * 100 : null,
      thisMonth: inv.filter((i) => new Date(i.createdAt) >= monthStart).length,
      lastInvoice: inv[0]?.createdAt || null,
      invoicedAmount: sum(inv.filter((i) => i.status === 'Success'), (i) => i.total),
      revenue: sum(pays, (p) => p.total),
      mrr: status === 'Active' && s ? getPackage(s.packageId)?.price || 0 : 0,
      customers: (u.customers || []).length, items: (u.products || []).length,
    };
  });
}

// ---------------- Sales ----------------
export const PAYMENT_TYPES = [
  { id: 'New', color: '#1f7fb5', label: 'New subscriptions' },
  { id: 'Renewal', color: '#3DB4D2', label: 'Renewals' },
  { id: 'Upgrade', color: '#C99B5B', label: 'Upgrades' },
  { id: 'Add-on', color: '#E7BE7D', label: 'Add-ons' },
];

export function allPayments() {
  return customers().flatMap((u) => (u.payments || []).map((p) => ({
    ...p, type: p.type || (p.total < 0 ? 'Refund' : 'Renewal'), userId: u.id, company: u.company?.name || u.fullName,
    packageName: getPackage(p.packageId)?.name || u.subscription?.packageName || '',
  }))).sort((a, b) => b.date.localeCompare(a.date));
}

export function salesReport(rangeId = '12m') {
  const { from, to } = resolveRange(rangeId);
  const pays = allPayments();
  const len = to.getTime() - from.getTime();
  const inR = pays.filter((p) => inRange(p.date, from, to));
  const gross = sum(inR.filter((p) => p.total > 0), (p) => p.total);
  const refunds = -sum(inR.filter((p) => p.total < 0), (p) => p.total);
  const net = gross - refunds;
  const comps = companyStats();
  const activeComps = comps.filter((c) => c.status === 'Active');
  const mrr = sum(activeComps, (c) => c.mrr);

  // previous period of the same length, for the trend arrow
  const prevFrom = new Date(from.getTime() - len);
  const prevGross = sum(pays.filter((p) => p.total > 0 && new Date(p.date) >= prevFrom && new Date(p.date) < from), (p) => p.total);

  const b = buckets(rangeId);
  const series = b.list.map((x) => ({ key: x.key, date: x.date, parts: Object.fromEntries([...PAYMENT_TYPES.map((t) => [t.id, 0]), ['Refund', 0]]) }));
  inR.forEach((p) => { const i = bucketOf(b, p.date); if (i >= 0) series[i].parts[p.total < 0 ? 'Refund' : p.type] = (series[i].parts[p.total < 0 ? 'Refund' : p.type] || 0) + Math.abs(p.total); });

  const byType = PAYMENT_TYPES.map((t) => ({ ...t, value: sum(inR.filter((p) => p.type === t.id && p.total > 0), (p) => p.total), count: inR.filter((p) => p.type === t.id).length }));
  const pkgIds = ['basic', 'standard', 'platinum'];
  const byPackage = pkgIds.map((id) => ({
    id, name: getPackage(id)?.name, price: getPackage(id)?.price,
    revenue: sum(inR.filter((p) => p.packageId === id && p.total > 0), (p) => p.total),
    active: activeComps.filter((c) => c.packageId === id).length,
  }));

  const in30 = new Date(Date.now() + 30 * 86400000);
  const renewals = comps.filter((c) => c.status === 'Active' && c.endDate && new Date(c.endDate) <= in30)
    .map((c) => ({ ...c, expected: +(periodPrice(getPackage(c.packageId), 1) * (1 + billingRate(c.endDate) / 100)).toFixed(2) }))
    .sort((a, b2) => a.endDate.localeCompare(b2.endDate));
  const expired = comps.filter((c) => c.status === 'Expired' || c.status === 'Refunded (Locked)');
  const top = [...comps].map((c) => ({ ...c, rangeRevenue: sum(inR.filter((p) => p.userId === c.userId), (p) => p.total) }))
    .filter((c) => c.rangeRevenue > 0).sort((a, b2) => b2.rangeRevenue - a.rangeRevenue).slice(0, 8);

  // Profit = revenue without VAT − refunds − Peppol delivery cost per invoice − payment gateway fees − fixed running costs.
  const fin = getFinance();
  const delivered = customers().reduce((a, u) => a + (u.invoices || []).filter((i) => i.status === 'Success' && inRange(i.createdAt, from, to)).length, 0);
  const revenueExVat = sum(inR.filter((p) => p.total > 0), exVat);
  const refundsExVat = -sum(inR.filter((p) => p.total < 0), exVat);
  const deliveryCost = delivered * fin.deliveryCost;
  const gatewayFees = inR.filter((p) => p.total > 0).length * fin.gatewayFixed + gross * (fin.gatewayPct / 100);
  // Fixed costs for the days covered (up to today), at the monthly amount / 30 per day.
  const coveredDays = Math.max(0, (Math.min(to.getTime(), Date.now()) - from.getTime()) / 86400000);
  const fixedCosts = +(fin.monthlyFixed * coveredDays / 30).toFixed(2);
  const profit = revenueExVat - refundsExVat - deliveryCost - gatewayFees - fixedCosts;
  const exBuckets = series.map(() => 0);
  inR.forEach((p) => { const i = bucketOf(b, p.date); if (i >= 0) exBuckets[i] += exVat(p); });
  const profitSeries = series.map((x, i) => ({ ...x, revenue: +exBuckets[i].toFixed(2) }));

  return {
    unit: b.unit, gross, refunds, net, revenueExVat, refundsExVat, delivered, deliveryCost, gatewayFees, fixedCosts, profit,
    margin: revenueExVat ? (profit / revenueExVat) * 100 : 0, profitSeries, finance: fin, vat: +(gross - revenueExVat).toFixed(2), payments: inR, count: inR.filter((p) => p.total > 0).length,
    trend: prevGross ? ((gross - prevGross) / prevGross) * 100 : null,
    mrr, arr: mrr * 12, active: activeComps.length, arpa: activeComps.length ? mrr / activeComps.length : 0,
    newCustomers: inR.filter((p) => p.type === 'New').length,
    churned: expired.length, churnRate: comps.length ? (expired.length / comps.length) * 100 : 0,
    series, byType, byPackage, renewals, expected30: sum(renewals, (r) => r.expected), expired, top,
  };
}

// ---------------- Invoice / platform report ----------------
export function platformReport(rangeId = '30d') {
  const { from, to } = resolveRange(rangeId);
  const all = customers().flatMap((u) => (u.invoices || []).map((i) => ({ ...i, userId: u.id, company: u.company?.name || u.fullName })));
  const inv = all.filter((i) => inRange(i.createdAt, from, to));
  const by = (st) => inv.filter((i) => i.status === st).length;
  const b = buckets(rangeId);
  const series = b.list.map((x) => ({ date: x.date, key: x.key, sent: 0, failed: 0 }));
  inv.forEach((i) => { const k = bucketOf(b, i.createdAt); if (k >= 0) { if (i.status === 'Success') series[k].sent++; else if (i.status === 'Failed') series[k].failed++; } });

  const sources = ['Manual', 'Excel', 'API'].map((s) => ({ label: s, value: inv.filter((i) => i.source === s).length }));
  const byCompany = new Map();
  inv.forEach((i) => {
    const c = byCompany.get(i.userId) || { company: i.company, userId: i.userId, total: 0, success: 0, failed: 0, amount: 0 };
    c.total++; if (i.status === 'Success') { c.success++; c.amount += i.total; } if (i.status === 'Failed') c.failed++;
    byCompany.set(i.userId, c);
  });
  const companiesList = [...byCompany.values()].sort((a, b2) => b2.total - a.total);
  const errors = new Map();
  inv.filter((i) => i.lastError && i.status === 'Failed').forEach((i) => errors.set(i.lastError, (errors.get(i.lastError) || 0) + 1));
  const regs = lastMonths(12).map((m) => ({ ...m, value: customers().filter((u) => monthKey(u.createdAt) === m.key).length }));
  const success = by('Success'); const failed = by('Failed');
  return {
    unit: b.unit, total: inv.length, success, failed, inProgress: inv.filter((i) => ACTIVE_STATUSES.includes(i.status)).length, cancelled: by('Cancelled'),
    successRate: success + failed ? (success / (success + failed)) * 100 : 0,
    retries: sum(inv, (i) => i.retryCount), amount: sum(inv.filter((i) => i.status === 'Success'), (i) => i.total),
    vat: sum(inv.filter((i) => i.status === 'Success'), (i) => i.vat),
    activeCompanies: byCompany.size, series, sources, companies: companiesList, errors: [...errors.entries()].map(([label, value]) => ({ label, value })).sort((a, b2) => b2.value - a.value),
    registrations: regs, invoices: inv,
  };
}

// ---------------- Customer company report ----------------
export function companyReport(user, rangeId = '30d') {
  const { from, to } = resolveRange(rangeId);
  const inv = (user.invoices || []).filter((i) => inRange(i.createdAt, from, to));
  const ok = inv.filter((i) => i.status === 'Success');
  const b = buckets(rangeId);
  const series = b.list.map((x) => ({ date: x.date, key: x.key, sent: 0, failed: 0, amount: 0 }));
  inv.forEach((i) => { const k = bucketOf(b, i.createdAt); if (k < 0) return; if (i.status === 'Success') { series[k].sent++; series[k].amount += i.total; } else if (i.status === 'Failed') series[k].failed++; });

  const custMap = new Map();
  ok.forEach((i) => { const c = custMap.get(i.customerName) || { label: i.customerName, value: 0, count: 0, vat: 0 }; c.value += i.total; c.vat += i.vat; c.count++; custMap.set(i.customerName, c); });
  const itemMap = new Map();
  ok.forEach((i) => (i.items || []).forEach((l) => { const k = l.name; const c = itemMap.get(k) || { label: k, value: 0, qty: 0, unit: l.unitCode || '' }; c.value += Number(l.net ?? l.qty * l.price) || 0; c.qty += Number(l.qty) || 0; itemMap.set(k, c); }));

  // VAT summary per category (taxable amount and VAT), as FTA returns need it.
  const vat = { S: { taxable: 0, tax: 0 }, Z: { taxable: 0, tax: 0 }, E: { taxable: 0, tax: 0 }, O: { taxable: 0, tax: 0 } };
  ok.forEach((i) => (i.items || []).forEach((l) => {
    const cat = l.taxCategory || (Number(l.vatRate) === 0 ? 'Z' : 'S');
    const net = Number(l.net ?? l.qty * l.price) || 0;
    const share = i.subtotal ? net / i.subtotal : 0;
    const taxable = net - (i.discount || 0) * share;
    vat[cat].taxable += taxable; vat[cat].tax += cat === 'S' ? taxable * (Number(l.vatRate) || 5) / 100 : 0;
  }));
  const by = (st) => inv.filter((i) => i.status === st).length;
  return {
    unit: b.unit, series, total: inv.length, success: ok.length, failed: by('Failed'), inProgress: inv.filter((i) => ACTIVE_STATUSES.includes(i.status)).length, cancelled: by('Cancelled'),
    amount: sum(ok, (i) => i.total), net: sum(ok, (i) => i.subtotal - (i.discount || 0)), vatTotal: sum(ok, (i) => i.vat), avg: ok.length ? sum(ok, (i) => i.total) / ok.length : 0,
    customers: [...custMap.values()].sort((a, b2) => b2.value - a.value), items: [...itemMap.values()].sort((a, b2) => b2.value - a.value),
    vat, sources: ['Manual', 'Excel', 'API'].map((s) => ({ label: s, value: inv.filter((i) => i.source === s).length })), invoices: inv,
  };
}

/** Write several sheets ([name, rows-of-arrays]) to an .xlsx file. */
export async function exportSheets(fileName, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, rows]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = (rows[0] || []).map((h, i) => ({ wch: Math.min(40, Math.max(10, String(h).length + 2, ...rows.slice(1, 50).map((r) => String(r[i] ?? '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, fileName);
}

// ---------------- System admin overview ----------------
/** Everything the product owner checks first: business, packages, sync and company balances. */
export function adminOverview() {
  const comps = companyStats();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today); monthStart.setDate(1);
  const all = customers().flatMap((u) => (u.invoices || []).map((i) => ({ ...i, company: u.company?.name || u.fullName })));
  const passedToday = all.filter((i) => i.status === 'Success' && new Date(i.createdAt) >= today).length;
  const failedToday = all.filter((i) => i.status === 'Failed' && new Date(i.createdAt) >= today).length;
  const pending = all.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const failed = all.filter((i) => i.status === 'Failed');
  const month = salesReport('30d');
  const pkgs = ['basic', 'standard', 'platinum'].map((id) => {
    const p = getPackage(id);
    const subs = comps.filter((c) => c.packageId === id);
    const active = subs.filter((c) => c.status === 'Active');
    return { id, name: p.name, price: p.price, active: active.length, expired: subs.length - active.length, mrr: active.length * p.price, revenue: month.byPackage.find((x) => x.id === id)?.revenue || 0 };
  });
  const balances = comps.filter((c) => c.limit).map((c) => ({ ...c, left: Math.max(0, c.limit - c.used), leftPct: Math.max(0, 100 - c.usedPct) }))
    .sort((a, b) => a.leftPct - b.leftPct);
  return {
    companies: comps.length, active: comps.filter((c) => c.status === 'Active').length,
    newThisMonth: comps.filter((c) => new Date(c.createdAt) >= monthStart).length,
    newSeries: lastMonths(6).map((m) => ({ ...m, value: comps.filter((c) => monthKey(c.createdAt) === m.key).length })),
    passedToday, failedToday, pending: pending.length, pendingByStatus: ['Queued', 'Processing', 'Sent to White Label', 'Retrying'].map((st) => ({ label: st, value: pending.filter((i) => i.status === st).length })),
    failed: failed.length, oldestPending: pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] || null,
    month, packages: pkgs, balances,
    lowBalance: balances.filter((c) => c.status === 'Active' && c.leftPct <= 20).length,
    expiringSoon: month.renewals.length,
  };
}

/** Profit & loss per period (day / week / month, following the range). */
export function plByPeriod(rangeId = '12m') {
  const fin = getFinance();
  const { from, to } = resolveRange(rangeId);
  const b = buckets(rangeId);
  const rows = b.list.map((x) => ({ key: x.key, date: x.date, period: x.key, gross: 0, vat: 0, revenue: 0, refunds: 0, delivered: 0, delivery: 0, gateway: 0, fixed: 0, profit: 0, payments: 0 }));
  allPayments().filter((p) => inRange(p.date, from, to)).forEach((p) => {
    const i = bucketOf(b, p.date); if (i < 0) return;
    const r = rows[i];
    if (p.total > 0) { r.gross += p.total; r.revenue += exVat(p); r.vat += p.total - exVat(p); r.payments += 1; r.gateway += fin.gatewayFixed + p.total * (fin.gatewayPct / 100); }
    else r.refunds += -exVat(p);
  });
  customers().forEach((u) => (u.invoices || []).forEach((inv) => {
    if (inv.status !== 'Success' || !inRange(inv.createdAt, from, to)) return;
    const i = bucketOf(b, inv.createdAt); if (i >= 0) rows[i].delivered += 1;
  }));
  rows.forEach((r, i) => {
    const x = b.list[i];
    const days = Math.max(0, (Math.min(x.to, to.getTime() + 1, Date.now()) - x.from) / 86400000);
    r.delivery = r.delivered * fin.deliveryCost;
    r.fixed = fin.monthlyFixed * days / 30;
    r.profit = r.revenue - r.refunds - r.delivery - r.gateway - r.fixed;
    r.margin = r.revenue ? (r.profit / r.revenue) * 100 : null;
    Object.keys(r).forEach((k) => { if (typeof r[k] === 'number' && k !== 'margin') r[k] = +r[k].toFixed(2); });
  });
  return { unit: b.unit, rows };
}

/** Every invoice across all companies (system admin). */
export function allInvoiceRows(rangeId = '30d') {
  const { from, to } = resolveRange(rangeId);
  return customers().flatMap((u) => (u.invoices || []).filter((i) => inRange(i.createdAt, from, to)).map((i) => ({
    id: `${u.id}-${i.id}`, invoice: i.id, date: i.createdAt, company: u.company?.name || u.fullName, customer: i.customerName,
    source: i.source, status: i.status, net: +(i.subtotal - (i.discount || 0)).toFixed(2), vat: i.vat, total: i.total, retries: i.retryCount || 0, qvalia: i.wlInvoiceId || '',
  }))).sort((a, b) => b.date.localeCompare(a.date));
}
