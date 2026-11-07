// Refund process flow:
// Customer request → Pending → Admin review (approve / reject) → Stripe refund
// → package Refunded (Locked), invoice creation & API disabled, pending queue cancelled → customer notified.
import { getUsers, saveUsers, updateUser, fail, delay } from './api';
import { addLog } from './logs';
import { notify } from './notifications';
import { ACTIVE_STATUSES } from './invoices';

const iso = () => new Date().toISOString();
const rid = (p) => `${p}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

export const REFUND_REASONS = [
  'Not satisfied with the service',
  'Purchased the wrong package',
  'Duplicate payment',
  'Business closed or no longer needs e-invoicing',
  'Other',
];

export const activeRefund = (user) => (user.refunds || []).find((r) => r.status === 'Pending' || r.status === 'Processing');

export async function requestRefund(user, { reason, comments, attachments }) {
  await delay(500);
  if (!user.subscription || user.subscription.locked) throw fail('There is no active package to refund.');
  if (activeRefund(user)) throw fail('You already have a refund request in review.');
  if (!reason) throw fail('Please choose a reason for the refund.');
  const isPackagePayment = (p) => p.status === 'Paid' && (typeof p.description === 'string' ? /package/i.test(p.description) : String(p.description?.key || '').includes('package'));
  const payments = [...(user.payments || [])].sort((a, b) => b.date.localeCompare(a.date));
  const lastPayment = payments.find(isPackagePayment) || payments.find((p) => p.status === 'Paid');
  const refund = {
    id: `RF-${String(Date.now()).slice(-5)}`,
    status: 'Pending',
    reason, comments: comments || '', attachments: attachments || [],
    requestedAt: iso(),
    amount: lastPayment?.total ?? user.subscription.total ?? 0,
    paymentId: lastPayment?.id || user.subscription.paymentId,
    packageName: user.subscription.packageName,
    usage: { used: user.subscription.transactionsUsed, limit: user.subscription.transactionsLimit },
    history: [{ status: 'Pending', at: iso(), note: 'Refund request created.' }],
  };
  updateUser(user.id, (u) => ({ refunds: [refund, ...(u.refunds || [])] }));
  addLog({ type: 'activity', userId: user.id, company: user.company?.name, action: 'Refund requested', details: '{id} · {reason}', vars: { id: refund.id, reason } });
  notify(user.id, { level: 'info', key: 'Refund request {id} was submitted and is pending review.', vars: { id: refund.id }, link: 'plan' });
  return refund;
}

/** All refund requests across customers (admin). */
export function allRefunds() {
  return getUsers().flatMap((u) => (u.refunds || []).map((r) => ({ ...r, userId: u.id, company: u.company?.name || u.fullName, owner: u.fullName, email: u.email })))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function rejectRefund(userId, refundId, note) {
  if (!note || !note.trim()) throw fail('Please give the customer a reason for the rejection.');
  await delay(400);
  updateUser(userId, (u) => ({
    refunds: (u.refunds || []).map((r) => (r.id === refundId ? { ...r, status: 'Rejected', decisionNote: note, decidedAt: iso(), history: [...r.history, { status: 'Rejected', at: iso(), note }] } : r)),
  }));
  const u = getUsers().find((x) => x.id === userId);
  addLog({ type: 'activity', userId, company: u?.company?.name, action: 'Refund rejected', details: '{id} · {note}', vars: { id: refundId, note } });
  notify(userId, { level: 'warning', key: 'Your refund request {id} was rejected: {note}', vars: { id: refundId, note }, link: 'plan' });
}

export async function approveRefund(userId, refundId) {
  // 1) Approved → processing via Stripe
  updateUser(userId, (u) => ({
    refunds: (u.refunds || []).map((r) => (r.id === refundId ? { ...r, status: 'Processing', history: [...r.history, { status: 'Approved', at: iso(), note: 'Approved by administrator.' }] } : r)),
  }));
  await delay(1500); // simulate Stripe refund
  const stripeRefundId = `re_${Math.random().toString(36).slice(2, 12)}`;

  // 2) Lock package, stop transactions, cancel pending queue
  const users = getUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) throw fail('User not found.');
  let cancelled = 0;
  u.invoices = (u.invoices || []).map((i) => {
    if (!ACTIVE_STATUSES.includes(i.status)) return i;
    cancelled += 1;
    return { ...i, status: 'Cancelled', history: [...i.history, { status: 'Cancelled', at: iso(), note: 'Cancelled: package refunded.' }] };
  });
  u.subscription = { ...u.subscription, status: 'Refunded (Locked)', locked: true, lockedAt: iso(), apiDisabled: true };
  u.refunds = (u.refunds || []).map((r) => (r.id === refundId
    ? { ...r, status: 'Refunded', stripeRefundId, refundedAt: iso(), cancelledInvoices: cancelled,
        history: [...r.history, { status: 'Refunded', at: iso(), note: 'Refund {re} succeeded via Stripe.', vars: { re: stripeRefundId } }] }
    : r));
  u.payments = [...(u.payments || []), { id: stripeRefundId, date: iso(), description: { key: 'Refund · {id}', vars: { id: refundId } }, total: -Math.abs(u.refunds.find((r) => r.id === refundId)?.amount || 0), status: 'Refunded' }];
  saveUsers(users);

  addLog({ type: 'transaction', userId, company: u.company?.name, action: 'Refund processed', details: '{id} · {re} · {n} pending invoice(s) cancelled', vars: { id: refundId, re: stripeRefundId, n: cancelled } });
  addLog({ type: 'activity', userId, company: u.company?.name, action: 'Package locked', details: 'Status: Refunded (Locked). Invoice creation and API access disabled.' });
  notify(userId, {
    level: 'info',
    key: 'Your refund has been processed successfully. Your package is now locked and its status is Refunded. You can still log in to view your history, but you cannot create new invoices or use the package.',
    link: 'plan',
  });
  return stripeRefundId;
}
