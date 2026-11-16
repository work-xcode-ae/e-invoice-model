// Admin panel data: companies, users, packages, queue and stats across all customers.
import { getUsers, read, write, updateUser, publicUser } from './api';
import { ACTIVE_STATUSES } from './invoices';
import { packages, DEFAULT_PACKAGES, PACKAGES_KEY, applyPackageOverrides } from '../data/packages';
import { addLog } from './logs';

export const ADMIN_EMAIL = 'admin@modelfc.ae';
export const ADMIN_PASSWORD = 'Admin@2026';

export const customers = () => getUsers().filter((u) => u.role !== 'SuperAdmin');

export function companies() {
  return customers().map((u) => {
    const s = u.subscription;
    const inv = u.invoices || [];
    return {
      userId: u.id,
      company: u.company?.name || '—',
      trn: u.company?.trn || '',
      owner: u.fullName,
      email: u.email,
      createdAt: u.createdAt,
      packageName: s?.packageName || null,
      status: s ? (s.locked ? 'Refunded (Locked)' : new Date(s.endDate) < new Date() ? 'Expired' : s.status) : 'No package',
      used: s?.transactionsUsed || 0,
      limit: s?.transactionsLimit || 0,
      users: 1 + (u.teamUsers || []).filter((m) => m.status === 'Active').length,
      usersLimit: s?.usersLimit || 0,
      endDate: s?.endDate || null,
      invoices: inv.length,
      failed: inv.filter((i) => i.status === 'Failed').length,
      active: !u.disabled,
    };
  });
}

export function allInvoices() {
  return customers().flatMap((u) => (u.invoices || []).map((i) => ({ ...i, userId: u.id, company: u.company?.name || u.fullName })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function stats() {
  const inv = allInvoices();
  const today = new Date().toISOString().slice(0, 10);
  const todays = inv.filter((i) => i.createdAt.slice(0, 10) === today);
  const count = (st) => inv.filter((i) => i.status === st).length;
  const done = inv.filter((i) => i.status === 'Success' || i.status === 'Failed');
  return {
    customers: customers().length,
    invoicesToday: todays.length,
    queued: count('Queued'),
    processing: count('Processing') + count('Sent to White Label'),
    retrying: count('Retrying'),
    sent: count('Success'),
    failed: count('Failed'),
    cancelled: count('Cancelled'),
    successRate: done.length ? (count('Success') / done.length) * 100 : 0,
  };
}

/** Sent vs failed per hour for the last 24 hours. */
export function last24h() {
  const inv = allInvoices();
  const end = new Date(); end.setMinutes(0, 0, 0);
  return Array.from({ length: 24 }, (_, i) => {
    const from = new Date(end.getTime() - (23 - i) * 3600000);
    const to = new Date(from.getTime() + 3600000);
    const inHour = inv.filter((x) => { const d = new Date(x.createdAt); return d >= from && d < to; });
    return { date: from.toISOString(), hour: from.getHours(), sent: inHour.filter((x) => x.status === 'Success').length, failed: inHour.filter((x) => x.status === 'Failed').length };
  });
}

export const queueItems = () => allInvoices().filter((i) => ACTIVE_STATUSES.includes(i.status) || i.status === 'Failed');

export function setCompanyActive(userId, active) {
  updateUser(userId, { disabled: !active });
  const u = getUsers().find((x) => x.id === userId);
  addLog({ type: 'activity', userId, company: u?.company?.name, action: active ? 'Company activated' : 'Company deactivated', details: 'By administrator' });
}

export function setTeamUserStatus(ownerId, memberId, status) {
  updateUser(ownerId, (u) => ({ teamUsers: (u.teamUsers || []).map((m) => (m.id === memberId ? { ...m, status } : m)) }));
}

// ----- Packages (BIL-02, BIL-03, SET-02): every field editable, new packages, price changes on a date -----
const PKG_FIELDS = ['name', 'tagline', 'taglineAr', 'price', 'annualPrice', 'transactions', 'overagePrice', 'setupFee', 'setupFeeType', 'users', 'entities', 'linkMethods', 'support', 'consultingHours', 'consultingDiscount', 'features', 'featuresAr', 'popular', 'active'];
const NUM = ['price', 'annualPrice', 'transactions', 'overagePrice', 'setupFee', 'users', 'entities', 'consultingHours', 'consultingDiscount'];
export function validatePackage(pkg) {
  if (!pkg.name?.trim()) throw Object.assign(new Error(''), { key: 'Enter a name.' });
  if (!pkg.custom && Number(pkg.annualPrice) > Number(pkg.price) * 12) throw Object.assign(new Error(''), { key: 'The annual price cannot be more than 12 × the monthly price ({max}).', vars: { max: Number(pkg.price) * 12 } });
  NUM.forEach((k) => { if (Number(pkg[k]) < 0) throw Object.assign(new Error(''), { key: 'Values cannot be negative.' }); });
}
/** Save now, or from `effectiveDate` (needs a second confirmation in the UI). New packages appear on the pricing page at once. */
export function savePackage(pkg, { effectiveDate } = {}) {
  validatePackage(pkg);
  const clean = Object.fromEntries(PKG_FIELDS.filter((k) => pkg[k] !== undefined).map((k) => [k, NUM.includes(k) ? Number(pkg[k]) : pkg[k]]));
  const overrides = read(PACKAGES_KEY, {});
  const isNew = !DEFAULT_PACKAGES.some((d) => d.id === pkg.id) && !(overrides._new || []).some((d) => d.id === pkg.id);
  const before = packages.find((p) => p.id === pkg.id) || null;
  const today = new Date().toISOString().slice(0, 10);
  if (isNew) {
    overrides._new = [...(overrides._new || []), { ...clean, id: pkg.id }];
  } else if (effectiveDate && effectiveDate > today) {
    import('./platform').then(({ scheduleChange }) => scheduleChange({ path: `package:${pkg.id}`, value: clean, effectiveDate, label: `Package ${pkg.name}` }));
    return 'scheduled';
  } else {
    overrides[pkg.id] = { ...(overrides[pkg.id] || {}), ...clean };
  }
  write(PACKAGES_KEY, overrides);
  applyPackageOverrides();
  import('./audit').then(({ addAudit }) => addAudit({ area: 'Packages', action: isNew ? 'Package created' : 'Package changed', entity: pkg.name, before: before && Object.fromEntries(PKG_FIELDS.map((k) => [k, before[k]])), after: clean }));
  addLog({ type: 'activity', action: 'Package updated', details: '{name}: AED {price} · {tx} transactions · {users} users', vars: { name: pkg.name, price: pkg.price, tx: pkg.transactions, users: pkg.users } });
  return 'saved';
}
export function saveAddon(addon) {
  const overrides = read(PACKAGES_KEY, {});
  overrides._addons = { ...(overrides._addons || {}), [addon.id]: { price: Number(addon.price), transactions: Number(addon.transactions) } };
  write(PACKAGES_KEY, overrides);
  applyPackageOverrides();
  addLog({ type: 'activity', action: 'Add-on updated', details: '+{tx} transactions · AED {price}', vars: { tx: addon.transactions, price: addon.price } });
}
export function resetPackages() { write(PACKAGES_KEY, {}); applyPackageOverrides(); }
export { packages, DEFAULT_PACKAGES };
export { addOns } from '../data/packages';

export const adminView = (u) => publicUser(u);

/** Admin goodwill: add free invoices to a company's current package. */
export function grantInvoices(userId, n, reason = '') {
  const add = Math.round(Number(n));
  if (!(add > 0)) return null;
  const u = getUsers().find((x) => x.id === userId);
  if (!u?.subscription) return null;
  updateUser(userId, (x) => ({ subscription: { ...x.subscription, transactionsLimit: x.subscription.transactionsLimit + add, addonTransactions: (x.subscription.addonTransactions || 0) + add } }));
  addLog({ type: 'activity', userId, company: u.company?.name, action: 'Free invoices added', details: '+{n} · {reason}', vars: { n: add, reason: reason || '—' } });
  return add;
}
