// Model's own documents to its customers (INV-01..INV-07, BR-13, BR-19):
//  - a tax invoice for every collection, numbered without gaps, one series for invoices and one for credit notes
//  - no edit and no delete after issue: corrections only by a credit note that points to the original
//  - emailed at once; sent as a PINT AE e-invoice from Model's account once the customer is linked
//  - a customer not registered for VAT still gets an invoice without TRN; e-sending depends on the Peppol ID
import { read, write, getUserById, getUsers, fail } from './api';
import { VAT_RATE, PRICES_INCLUDE_VAT } from '../data/packages';
import { getPlatform } from './platform';
import { addAudit } from './audit';
import { createTask } from './tasks';
import { addLog } from './logs';

const KEY = 'mei_model_docs';
const COUNTERS = 'mei_counters';
const iso = (d = new Date()) => new Date(d).toISOString();

export const getModelDocs = () => read(KEY, []);
export const docsOf = (customerId) => getModelDocs().filter((d) => d.customerId === customerId);
export const getDoc = (id) => getModelDocs().find((d) => d.id === id) || null;

/** Next number of a series (INV / CN). Gapless: a number is only taken when the document is issued. */
function nextNumber(series) {
  const year = new Date().getFullYear();
  const key = `${series}-${year}`;
  const c = read(COUNTERS, {});
  const n = (c[key] || 0) + 1;
  write(COUNTERS, { ...c, [key]: n });
  return `${series}-${year}-${String(n).padStart(6, '0')}`;
}

/** Totals for lines (discount and credit lines are negative). Prices exclude VAT unless the admin says otherwise. */
export function totals(lines, { vatRate = VAT_RATE, included = PRICES_INCLUDE_VAT, registered = true } = {}) {
  const gross = +lines.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2);
  const rate = registered ? vatRate : 0;
  if (included) {
    const net = +(gross / (1 + rate)).toFixed(2);
    return { subtotal: net, vat: +(gross - net).toFixed(2), total: gross, vatRate: +(rate * 100).toFixed(2) };
  }
  const vat = +(gross * rate).toFixed(2);
  return { subtotal: gross, vat, total: +(gross + vat).toFixed(2), vatRate: +(rate * 100).toFixed(2) };
}

const partyOf = (u) => ({
  name: u?.company?.name || u?.fullName || '',
  legalName: u?.company?.legalName || u?.company?.name || '',
  trn: u?.company?.vatRegistered === false ? '' : (u?.company?.trn || ''),
  address: [u?.company?.street || u?.company?.address, u?.company?.city, u?.company?.emirate, 'UAE'].filter(Boolean).join(', '),
  email: u?.email || '',
  peppolId: u?.linking?.peppolId || '',
});

/** E-invoice status for a new document: sent now when the customer is linked, else waiting. */
const einvoiceFor = (u) => (u?.linking?.status === 'Linked' && u?.linking?.peppolId ? { status: 'Queued', at: iso() } : { status: 'Awaiting linking', at: iso() });

/**
 * Issue a tax invoice. `lines` = [{ desc: {key, vars} | string, period?, qty?, unitPrice?, amount, kind }].
 * `customerId` can be a user id, or null with `party` for advertisers outside the customer base.
 */
export function issueInvoice({ customerId = null, party = null, kind = 'Subscription', lines, method = 'Card', paymentRef = '', status = 'Paid', contractRef = '', note = '' }) {
  if (!lines?.length) throw fail('Add at least one line.');
  const u = customerId ? getUserById(customerId) : null;
  const to = party || partyOf(u);
  const doc = {
    id: nextNumber(getPlatform().modelTax.invoicePrefix || 'INV'),
    type: 'Invoice', kind, customerId, customer: to,
    seller: { ...getPlatform().modelTax },
    date: iso(), lines, ...totals(lines, { registered: true }),
    paymentMethod: method, paymentRef, status, contractRef, note,
    emailedTo: to.email, emailedAt: to.email ? iso() : null,
    einvoice: customerId ? einvoiceFor(u) : { status: 'Not required', at: iso() },
    creditedAmount: 0,
  };
  write(KEY, [doc, ...getModelDocs()]);
  addAudit({ area: 'Model invoices', action: 'Tax invoice issued', entity: doc.id, before: null, after: { customer: to.name, total: doc.total, kind } });
  addLog({ type: 'transaction', userId: customerId, company: to.name, action: 'Tax invoice issued', details: '{id} · {total}', vars: { id: doc.id, total: doc.total } });
  if (doc.einvoice.status === 'Queued') sendEInvoice(doc.id);
  return doc;
}

/** Credit note against an invoice (INV-04, BR-11, BR-19). Amount excl. VAT; cannot exceed what is left. */
export function issueCreditNote({ invoiceId, amount, reason, lines }) {
  const inv = getDoc(invoiceId);
  if (!inv || inv.type !== 'Invoice') throw fail('Invoice not found.');
  if (!reason || !reason.trim()) throw fail('Give a reason for the credit note.');
  const left = +(inv.subtotal - (inv.creditedAmount || 0)).toFixed(2);
  const amt = Number(amount ?? left);
  if (!(amt > 0) || amt > left + 0.001) throw fail('The amount must be more than 0 and at most {max}.', { max: left });
  const cnLines = lines || [{ desc: { key: 'Credit against invoice {id}: {reason}', vars: { id: inv.id, reason } }, amount: amt, kind: 'credit' }];
  const u = inv.customerId ? getUserById(inv.customerId) : null;
  const cn = {
    id: nextNumber(getPlatform().modelTax.creditPrefix || 'CN'),
    type: 'Credit note', kind: inv.kind, customerId: inv.customerId, customer: inv.customer, seller: inv.seller,
    date: iso(), lines: cnLines, ...totals(cnLines), refInvoice: inv.id, reason,
    paymentMethod: inv.paymentMethod, status: 'Issued', emailedTo: inv.customer.email, emailedAt: iso(),
    einvoice: inv.customerId ? einvoiceFor(u) : { status: 'Not required', at: iso() },
  };
  write(KEY, [cn, ...getModelDocs().map((d) => (d.id === inv.id ? { ...d, creditedAmount: +((d.creditedAmount || 0) + cn.subtotal).toFixed(2) } : d))]);
  addAudit({ area: 'Model invoices', action: 'Credit note issued', entity: cn.id, before: { invoice: inv.id, credited: inv.creditedAmount || 0 }, after: { amount: cn.total, reason } });
  if (cn.einvoice.status === 'Queued') sendEInvoice(cn.id);
  return cn;
}

/** Mark an unpaid invoice as paid (bank transfer confirmed, grace payment…). */
export function markPaid(docId, { method, paymentRef }) {
  const list = getModelDocs();
  const d = list.find((x) => x.id === docId);
  if (!d) throw fail('Invoice not found.');
  write(KEY, list.map((x) => (x.id === docId ? { ...x, status: 'Paid', paidAt: iso(), paymentMethod: method || x.paymentMethod, paymentRef: paymentRef || x.paymentRef } : x)));
  addAudit({ area: 'Model invoices', action: 'Invoice marked paid', entity: docId, before: { status: d.status }, after: { status: 'Paid', method, paymentRef } });
}

// ---------- E-invoice sending from Model's account (INV-05) ----------
const patch = (id, fn) => write(KEY, getModelDocs().map((d) => (d.id === id ? fn(d) : d)));

/** Simulated send through the technical partner. Failure → IT task; never counted in the customer's quota. */
export function sendEInvoice(docId, { forceFail = false } = {}) {
  const d = getDoc(docId);
  if (!d || !d.customerId) return;
  const u = getUserById(d.customerId);
  if (u?.linking?.status !== 'Linked') { patch(docId, (x) => ({ ...x, einvoice: { status: 'Awaiting linking', at: iso() } })); return; }
  const ok = !forceFail && Math.random() > 0.08;
  if (ok) {
    patch(docId, (x) => ({ ...x, einvoice: { status: 'Sent', at: iso(), ref: `MSG-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, to: u.linking.peppolId } }));
  } else {
    const error = 'Receiver endpoint not found in SMP (simulated)';
    patch(docId, (x) => ({ ...x, einvoice: { status: 'Rejected', at: iso(), error } }));
    createTask({ type: 'einvoice-failed', ref: { kind: 'doc', id: docId, name: `${docId} · ${d.customer.name}` }, note: error });
    addLog({ type: 'error', userId: d.customerId, company: d.customer.name, action: 'Model e-invoice rejected', details: '{id} · {err}', vars: { id: docId, err: error } });
  }
}

/** After activation: send every document that was waiting for the customer to be linked. */
export function sendPendingEInvoices(customerId) {
  docsOf(customerId).filter((d) => d.einvoice?.status === 'Awaiting linking').forEach((d) => sendEInvoice(d.id));
}

/** All documents with the customer's current company name (admin lists). */
export function allDocsWithCompany() {
  const names = Object.fromEntries(getUsers().map((u) => [u.id, u.company?.name || u.fullName]));
  return getModelDocs().map((d) => ({ ...d, company: d.customerId ? names[d.customerId] || d.customer.name : d.customer.name }));
}
