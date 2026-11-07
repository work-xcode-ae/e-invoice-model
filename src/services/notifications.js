// In-system notifications.
// - Stored notifications: events (payment, invoice failed, refund decision…), kept per user.
// - Live alerts: computed from the current state (invoices left, renewal date…) so they are always accurate.
import { updateUser } from './api';

const uid = () => Math.random().toString(36).slice(2, 10);

/** level: 'info' | 'success' | 'warning' | 'danger'. key/vars = English template for translation. */
export function notify(userId, { level = 'info', key, vars = {}, link = null, dedupe = null }) {
  try {
    updateUser(userId, (u) => {
      const list = u.notifications || [];
      if (dedupe && list.some((n) => n.dedupe === dedupe)) return {};
      return { notifications: [{ id: uid(), level, key, vars, link, dedupe, at: new Date().toISOString(), read: false }, ...list].slice(0, 60) };
    });
  } catch { /* user removed */ }
}

export const markAllRead = (userId) =>
  updateUser(userId, (u) => ({ notifications: (u.notifications || []).map((n) => ({ ...n, read: true })) }));

export const clearNotifications = (userId) => updateUser(userId, { notifications: [] });

const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);

/** Alerts derived from the subscription right now. Most urgent first. */
export function liveAlerts(user) {
  const s = user?.subscription;
  const out = [];
  if (!s) {
    out.push({ id: 'no-plan', level: 'info', key: 'You have no active package. Choose one to start sending e-invoices.', action: 'packages' });
    return out;
  }
  if (s.locked) {
    out.push({ id: 'locked', level: 'danger', key: 'Your package was refunded and is locked. You can view your history, but you cannot create new invoices.', action: null });
    return out;
  }
  const inflight = (user.invoices || []).filter((i) => ['Queued', 'Processing', 'Sent to White Label', 'Retrying'].includes(i.status)).length;
  const left = Math.max(0, s.transactionsLimit - s.transactionsUsed - inflight);
  const pct = s.transactionsLimit ? left / s.transactionsLimit : 0;
  const days = daysBetween(new Date(), s.endDate);

  if (days < 0) out.push({ id: 'expired', level: 'danger', key: 'Your package expired on {date}. Renew it to continue sending invoices.', vars: { date: s.endDate }, dateVar: 'date', action: 'renew' });
  if (left === 0) out.push({ id: 'limit-0', level: 'danger', key: 'You have used all {limit} invoices in your package. New invoices are paused until you renew, upgrade or buy an add-on.', vars: { limit: s.transactionsLimit }, action: 'addon' });
  else if (pct <= 0.1) out.push({ id: 'limit-10', level: 'danger', key: 'Only {left} invoices left ({pct}% of your package). Renew or buy an add-on to avoid interruptions.', vars: { left, pct: Math.round(pct * 100) }, action: 'addon' });
  else if (pct <= 0.2) out.push({ id: 'limit-20', level: 'warning', key: '{left} invoices left in your package ({pct}%). Consider an add-on or upgrade.', vars: { left, pct: Math.round(pct * 100) }, action: 'addon' });
  if (days >= 0 && days <= 7) out.push({ id: 'renew-7', level: days <= 3 ? 'danger' : 'warning', key: 'Your package ends in {days} days, on {date}. Renew now to keep sending invoices.', vars: { days, date: s.endDate }, dateVar: 'date', action: 'renew' });
  if (s.pendingChange) out.push({ id: 'pending', level: 'info', key: 'Your plan switches to {name} on {date}.', vars: { name: s.pendingChange.packageName, date: s.pendingChange.effectiveDate }, dateVar: 'date', action: 'plan' });
  const failed = (user.invoices || []).filter((i) => i.status === 'Failed').length;
  if (failed) out.push({ id: 'failed', level: 'warning', key: '{n} invoice(s) failed after all retry attempts. Review and resend them.', vars: { n: failed }, action: 'invoices' });
  if (!user.company) out.push({ id: 'company', level: 'info', key: 'Add your company details before creating invoices.', action: 'company' });
  return out;
}

/** Invoices the customer can still send (limit − used − in progress). */
export function invoicesLeft(user) {
  const s = user?.subscription;
  if (!s) return 0;
  const inflight = (user.invoices || []).filter((i) => ['Queued', 'Processing', 'Sent to White Label', 'Retrying'].includes(i.status)).length;
  return Math.max(0, s.transactionsLimit - s.transactionsUsed - inflight);
}
