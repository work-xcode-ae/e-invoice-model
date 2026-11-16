// Technical partner integration (INT-01, INT-04, RPT-02). Its name never appears in the UI (BR-23):
// the platform calls it "the technical partner" / "access point".
//  - usage reading every hour + a refresh button (CUS-01)
//  - every integration failure creates an IT task with the error log (no silent failure)
//  - monthly reconciliation between the partner's invoice and our own document counts
import { read, write, getUsers, getUserById, updateUser, fail, delay } from './api';
import { consume, withLegacy } from './usage';
import { createTask } from './tasks';
import { addLog } from './logs';
import { getPlatform } from './platform';
import { stageOf } from './lifecycle';

const ERR_KEY = 'mei_integration_errors';
const RECON_KEY = 'mei_reconciliation';
const iso = (d = new Date()) => new Date(d).toISOString();

export const getIntegrationErrors = () => read(ERR_KEY, []);

/** Log an integration error and open an IT task for it (INT-04). */
export function integrationError({ system, operation, error, ref = {} }) {
  const e = { id: `IE-${Date.now().toString(36)}`, at: iso(), system, operation, error, ref, status: 'Open' };
  write(ERR_KEY, [e, ...getIntegrationErrors()].slice(0, 300));
  createTask({ type: 'integration-error', ref: { kind: 'integration', id: e.id, name: `${system} · ${operation}` }, note: error });
  addLog({ type: 'error', action: 'Integration error', details: '{system} · {op}: {err}', vars: { system, op: operation, err: error } });
  return e;
}
export function resolveIntegrationError(id) {
  write(ERR_KEY, getIntegrationErrors().map((e) => (e.id === id ? { ...e, status: 'Resolved', resolvedAt: iso() } : e)));
}

/**
 * Read the customer's document count from the technical partner (demo: a few new documents since the last
 * reading). Sent documents only; received documents never count (BR-03).
 */
export async function syncUsage(userId, { manual = false, fail: forceFail = false } = {}) {
  await delay(manual ? 800 : 0);
  const u = getUserById(userId);
  const s = u?.subscription;
  if (!s?.ledger || stageOf(u) !== 'Active') return null;
  if (forceFail) {
    integrationError({ system: 'Technical partner', operation: 'Usage reading', error: 'HTTP 503 from usage endpoint (simulated)', ref: { kind: 'company', id: userId, name: u.company?.name } });
    throw fail('The usage reading failed. Our IT team was notified.');
  }
  const mins = (Date.now() - new Date(s.ledger.lastSync || 0).getTime()) / 60000;
  const newDocs = Math.min(40, Math.max(0, Math.round(mins / 60 * (2 + Math.random() * 4))));
  const ledger = { ...consume(s.ledger, newDocs), lastSync: iso() };
  updateUser(userId, { subscription: withLegacy({ ...s, ledger }) });
  return { newDocs, at: ledger.lastSync };
}

/** Hourly job (demo: every few minutes while the app is open). */
export function syncAllUsage() {
  const every = Number(getPlatform().durations.usageSyncMinutes) || 60;
  getUsers().forEach((u) => {
    const l = u.subscription?.ledger;
    if (l && (Date.now() - new Date(l.lastSync || 0).getTime()) / 60000 >= every) syncUsage(u.id).catch(() => {});
  });
}

// ---------- Reconciliation with the technical partner's invoice (RPT-02) ----------
export const getReconciliations = () => read(RECON_KEY, {});

/**
 * Import the partner's monthly invoice (demo: built from our counts with a few differences) and compare it
 * customer by customer. Every difference gets a status and a task.
 */
export function importPartnerInvoice(month, { perDocCost = 0.35 } = {}) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw fail('Choose a month.');
  const rows = getUsers().filter((u) => u.subscription?.ledger).map((u, i) => {
    const ours = u.subscription.ledger.sentTotal || u.subscription.transactionsUsed || 0;
    const delta = i % 4 === 1 ? Math.ceil(Math.random() * 6) : i % 7 === 3 ? -2 : 0;
    const theirs = Math.max(0, ours + delta);
    return { customerId: u.id, company: u.company?.name || u.fullName, ours, theirs, diff: theirs - ours, status: theirs === ours ? 'Matched' : 'Difference', note: '' };
  });
  const docs = rows.reduce((s, r) => s + r.theirs, 0);
  const rec = { month, importedAt: iso(), partnerInvoice: { number: `TP-${month.replace('-', '')}-${Math.floor(1000 + Math.random() * 8999)}`, docs, perDocCost, amount: +(docs * perDocCost).toFixed(2) }, rows, closed: false };
  write(RECON_KEY, { ...getReconciliations(), [month]: rec });
  rows.filter((r) => r.status === 'Difference').forEach((r) => createTask({ type: 'reconciliation-diff', ref: { kind: 'recon', id: `${month}:${r.customerId}`, name: `${month} · ${r.company}` }, note: `Ours ${r.ours} · partner ${r.theirs}` }));
  return rec;
}

export function resolveDifference(month, customerId, note) {
  if (!note?.trim()) throw fail('Explain how the difference was resolved.');
  const all = getReconciliations();
  const rec = all[month];
  write(RECON_KEY, { ...all, [month]: { ...rec, rows: rec.rows.map((r) => (r.customerId === customerId ? { ...r, status: 'Resolved', note, resolvedAt: iso() } : r)) } });
}
