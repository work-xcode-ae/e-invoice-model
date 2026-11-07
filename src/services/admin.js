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

// ----- Packages (admin can edit price, limits and availability) -----
export function savePackage(pkg) {
  const overrides = read(PACKAGES_KEY, {});
  overrides[pkg.id] = { price: Number(pkg.price), transactions: Number(pkg.transactions), users: Number(pkg.users), active: pkg.active !== false };
  write(PACKAGES_KEY, overrides);
  applyPackageOverrides();
  addLog({ type: 'activity', action: 'Package updated', details: '{name}: AED {price} · {tx} transactions · {users} users', vars: { name: pkg.name, price: pkg.price, tx: pkg.transactions, users: pkg.users } });
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
