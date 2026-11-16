// Refund process flow:
// Customer request → Pending → Admin review (approve / reject) → Stripe refund
// → package Refunded (Locked), invoice creation & API disabled, pending queue cancelled → customer notified.
import { getUsers, saveUsers, updateUser, fail, delay } from './api';
import { addLog } from './logs';
import { notify } from './notifications';
import { ACTIVE_STATUSES } from './invoices';
import { getPlatform } from './platform';
import { docsOf, issueCreditNote } from './modelDocs';
import { onRefund as commissionOnRefund } from './partners';
import { createTask, completeTasksFor, addWorkingHours } from './tasks';
import { sendTemplate } from './messaging';
import { addAudit } from './audit';
import { formatMoney } from '../data/packages';

/**
 * Refund rules (BR-09, BR-10): a full refund when requested within 14 days of payment, linking is not
 * complete and no document was sent. After linking the setup fee is not refundable and there is no partial
 * refund on cancellation; any exception is the manager's decision.
 */
export function refundEligibility(user) {
  const days = getPlatform().durations.refundDays;
  const inv = docsOf(user.id).filter((d) => d.type === 'Invoice' && d.status === 'Paid').sort((a, b) => b.date.localeCompare(a.date))[0];
  const paidAt = inv?.date || user.subscription?.paidAt || user.payments?.slice(-1)[0]?.date;
  const age = paidAt ? (Date.now() - new Date(paidAt).getTime()) / 86400000 : 999;
  const linked = user.linking?.status === 'Linked' || (user.stage || 'Active') === 'Active';
  const sent = user.subscription?.ledger?.sentTotal || 0;
  const reasons = [];
  if (age > days) reasons.push({ key: 'More than {n} days since payment.', vars: { n: days } });
  if (linked) reasons.push({ key: 'Linking is complete: the setup fee is not refundable and there is no partial refund.' });
  if (sent > 0) reasons.push({ key: '{n} document(s) were already sent.', vars: { n: sent } });
  const setup = inv ? inv.lines.filter((l) => l.kind === 'setup').reduce((x, l) => x + l.amount, 0) : 0;
  return { eligible: !reasons.length, reasons, invoice: inv || null, fullAmount: inv ? +(inv.subtotal - (inv.creditedAmount || 0)).toFixed(2) : 0, setup, method: inv?.paymentMethod || 'Card', daysLeft: Math.max(0, Math.ceil(days - age)) };
}

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
  const elig = refundEligibility(user);
  const refund = {
    id: `RF-${String(Date.now()).slice(-5)}`,
    status: 'Pending',
    eligible: elig.eligible, eligibilityReasons: elig.reasons, invoiceId: elig.invoice?.id || null, method: elig.method,
    exception: !elig.eligible,
    reason, comments: comments || '', attachments: attachments || [],
    requestedAt: iso(),
    amount: elig.invoice ? +(elig.fullAmount * (1 + (elig.invoice.vatRate || 0) / 100)).toFixed(2) : (lastPayment?.total ?? user.subscription.total ?? 0),
    paymentId: lastPayment?.id || user.subscription.paymentId,
    packageName: user.subscription.packageName,
    usage: { used: user.subscription.transactionsUsed, limit: user.subscription.transactionsLimit },
    history: [{ status: 'Pending', at: iso(), note: 'Refund request created.' }],
  };
  updateUser(user.id, (u) => ({ refunds: [refund, ...(u.refunds || [])] }));
  addLog({ type: 'activity', userId: user.id, company: user.company?.name, action: 'Refund requested', details: '{id} · {reason}', vars: { id: refund.id, reason } });
  notify(user.id, { level: 'info', key: 'Refund request {id} was submitted and is pending review.', vars: { id: refund.id }, link: 'plan' });
  createTask({ type: 'refund-approval', ref: { kind: 'refund', id: `${user.id}:${refund.id}`, name: `${refund.id} · ${user.company?.name || user.fullName}` }, note: elig.eligible ? 'Eligible for a full refund' : 'Exception: outside the refund rules' });
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
  completeTasksFor(`${userId}:${refundId}`);
  addLog({ type: 'activity', userId, company: u?.company?.name, action: 'Refund rejected', details: '{id} · {note}', vars: { id: refundId, note } });
  notify(userId, { level: 'warning', key: 'Your refund request {id} was rejected: {note}', vars: { id: refundId, note }, link: 'plan' });
}

/**
 * Manager approves (INV-08): automatic credit note, partner commission cancelled or reversed, money back
 * through the same payment method within 7 working days, with tracking. `amountExVat` lets the manager
 * decide an exception (e.g. without the setup fee).
 */
export async function approveRefund(userId, refundId, { amountExVat } = {}) {
  const u0 = getUsers().find((x) => x.id === userId);
  const r0 = (u0?.refunds || []).find((r) => r.id === refundId);
  if (!r0) throw fail('Refund not found.');
  updateUser(userId, (u) => ({
    refunds: (u.refunds || []).map((r) => (r.id === refundId ? { ...r, status: 'Processing', history: [...r.history, { status: 'Approved', at: iso(), note: 'Approved by administrator.' }] } : r)),
  }));
  await delay(1200);
  // 1) Credit note against the original invoice
  let cn = null;
  if (r0.invoiceId) {
    const inv = docsOf(userId).find((d) => d.id === r0.invoiceId);
    const left = inv ? +(inv.subtotal - (inv.creditedAmount || 0)).toFixed(2) : 0;
    const amt = amountExVat !== undefined ? Math.min(left, Number(amountExVat)) : left;
    if (amt > 0) cn = issueCreditNote({ invoiceId: r0.invoiceId, amount: amt, reason: `Refund ${refundId}` });
  }
  // 2) Partner commission (BR-17)
  commissionOnRefund(userId, r0.invoiceId ? [r0.invoiceId] : null);
  // 3) Money back through the same method
  const method = r0.method || 'Card';
  const providerRef = method === 'Card' ? `re_${Math.random().toString(36).slice(2, 12)}` : null;
  const dueBy = addWorkingHours(new Date(), (getPlatform().durations.refundPayoutBusinessDays || 7) * 9).toISOString();
  const amount = cn ? cn.total : r0.amount;

  const users = getUsers();
  const u = users.find((x) => x.id === userId);
  let cancelled = 0;
  u.invoices = (u.invoices || []).map((i) => {
    if (!ACTIVE_STATUSES.includes(i.status)) return i;
    cancelled += 1;
    return { ...i, status: 'Cancelled', history: [...i.history, { status: 'Cancelled', at: iso(), note: 'Cancelled: package refunded.' }] };
  });
  u.subscription = { ...u.subscription, status: 'Refunded (Locked)', locked: true, lockedAt: iso(), apiDisabled: true, autoRenew: false };
  u.refunds = (u.refunds || []).map((r) => (r.id === refundId
    ? { ...r, status: method === 'Card' ? 'Refunded' : 'Refund initiated', amount, creditNoteId: cn?.id || null, stripeRefundId: providerRef, refundedAt: method === 'Card' ? iso() : null, dueBy, cancelledInvoices: cancelled,
        history: [...r.history,
          ...(cn ? [{ status: 'Credit note', at: iso(), note: 'Credit note {cn} issued.', vars: { cn: cn.id } }] : []),
          method === 'Card'
            ? { status: 'Refunded', at: iso(), note: 'Refund {re} sent to the card. It reaches the customer within {n} working days.', vars: { re: providerRef, n: getPlatform().durations.refundPayoutBusinessDays } }
            : { status: 'Refund initiated', at: iso(), note: 'Bank transfer back to the customer, due by {date}.', vars: { date: dueBy.slice(0, 10) } }] }
    : r));
  u.payments = [...(u.payments || []), { id: providerRef || `rf_${refundId}`, date: iso(), description: { key: 'Refund · {id}', vars: { id: refundId } }, total: -Math.abs(amount || 0), status: 'Refunded', method }];
  saveUsers(users);
  completeTasksFor(`${userId}:${refundId}`);
  addAudit({ area: 'Refunds', action: 'Refund approved', entity: refundId, before: { status: 'Pending' }, after: { amount, creditNote: cn?.id, method } });
  addLog({ type: 'transaction', userId, company: u.company?.name, action: 'Refund processed', details: '{id} · {re} · {n} pending invoice(s) cancelled', vars: { id: refundId, re: providerRef || 'bank transfer', n: cancelled } });
  sendTemplate('refund', { userId }, { id: refundId, cn: cn?.id || '—', amount: formatMoney(amount), method: method === 'Card' ? 'card' : 'bank account' }, { level: 'info', link: 'plan' });
  return providerRef || refundId;
}

/** Bank-transfer refund: the manager records the transfer back to the customer. */
export function markRefundPaid(userId, refundId, transferRef) {
  if (!transferRef?.trim()) throw fail('Enter the bank transfer reference.');
  updateUser(userId, (u) => ({ refunds: (u.refunds || []).map((r) => (r.id === refundId ? { ...r, status: 'Refunded', refundedAt: iso(), transferRef, history: [...r.history, { status: 'Refunded', at: iso(), note: 'Transferred back · {ref}', vars: { ref: transferRef } }] } : r)) }));
}
