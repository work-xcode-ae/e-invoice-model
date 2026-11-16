// In-system notifications.
// - Stored notifications: events (payment, invoice failed, refund decision…), kept per user.
// - Live alerts: computed from the current state (invoices left, renewal date…) so they are always accurate.
import { updateUser } from './api';
import { usageSummary } from './usage';

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

/** Alerts derived from the account stage and subscription right now. Most urgent first. */
export function liveAlerts(user) {
  const s = user?.subscription;
  const out = [];
  const stage = user?.stage || (s ? 'Active' : 'Awaiting payment');
  if (!s) {
    out.push({ id: 'no-plan', level: 'info', key: 'You have no active package. Choose one to submit your application.', action: 'packages' });
    return out;
  }
  if (s.locked) {
    out.push({ id: 'locked', level: 'danger', key: 'Your package was refunded and is locked. You can view your history, but you cannot create new invoices.', action: null });
    return out;
  }
  if (stage === 'Suspended') out.push({ id: 'suspended', level: 'danger', key: 'Your account is suspended. Pay the open invoice to resume at once.', action: 'plan' });
  if (s.status === 'Past due') out.push({ id: 'grace', level: 'danger', key: 'Your renewal payment failed. Pay by {date} to avoid suspension. Sending continues meanwhile.', vars: { date: s.graceUntil }, dateVar: 'date', action: 'plan' });
  if (['Awaiting documents', 'Under review', 'Awaiting linking'].includes(stage)) out.push({ id: 'journey', level: 'info', key: 'Your account is not active yet: {stage}.', vars: { stage }, action: 'journey' });
  const u = usageSummary(s);
  if (u && u.allowance) {
    const pct = (u.used + u.overage.count) / u.allowance;
    if (pct >= 1) out.push({ id: 'use-100', level: 'warning', key: 'You have used all of this month’s documents. Sending continues; {n} extra document(s) so far, billed on your next invoice.', vars: { n: u.overage.count }, action: 'usage' });
    else if (pct >= 0.8) out.push({ id: 'use-80', level: 'warning', key: 'You have used {pct}% of your documents this month.', vars: { pct: Math.round(pct * 100) }, action: 'usage' });
  }
  if (s.cancelAtPeriodEnd && s.endDate) out.push({ id: 'cancel', level: 'info', key: 'Auto-renewal is off. Your subscription ends on {date}.', vars: { date: s.endDate }, dateVar: 'date', action: 'plan' });
  else if (stage === 'Active' && s.endDate && !s.ledger) {
    const days = daysBetween(new Date(), s.endDate);
    if (days >= 0 && days <= 7) out.push({ id: 'renew-7', level: 'info', key: 'Your subscription renews on {date}.', vars: { date: s.endDate }, dateVar: 'date', action: 'plan' });
  }
  if (s.pendingChange) out.push({ id: 'pending', level: 'info', key: 'Your plan switches to {name} on {date}.', vars: { name: s.pendingChange.packageName, date: s.pendingChange.effectiveDate }, dateVar: 'date', action: 'plan' });
  if (!user.company) out.push({ id: 'company', level: 'info', key: 'Add your company details before creating invoices.', action: 'company' });
  return out;
}

/** Invoices the customer can still send (limit − used − in progress). */
export function invoicesLeft(user) {
  const s = user?.subscription;
  if (!s) return 0;
  const u = usageSummary(s);
  if (u) return u.left;
  const inflight = (user.invoices || []).filter((i) => ['Queued', 'Processing', 'Sent to White Label', 'Retrying'].includes(i.status)).length;
  return Math.max(0, s.transactionsLimit - s.transactionsUsed - inflight);
}
