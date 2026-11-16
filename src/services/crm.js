// Leads (CRM-01..CRM-06, BR-22): New → Qualified → Proposal → Won / Lost, with notes, follow-ups and
// loss reasons from the settings. Every lead keeps its source. New leads go to Sales in turn and must be
// contacted within one working day, or the manager is alerted.
import { read, write, fail, delay, getUsers } from './api';
import { addAudit } from './audit';
import { createTask, completeTasksFor } from './tasks';
import { sendRaw } from './messaging';

const KEY = 'mei_leads';
const CAMP_KEY = 'mei_campaigns';
const iso = (d = new Date()) => new Date(d).toISOString();
const who = () => { try { const s = JSON.parse(localStorage.getItem('mei_session')); return s?.partnerUser?.name || s?.user?.fullName || 'Website'; } catch { return 'Website'; } };

export const LEAD_STAGES = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];
export const LEAD_SOURCES = ['Website form', 'Partner', 'Existing Model client', 'Enterprise', 'Advertisement', 'Obligation tool', 'WhatsApp'];

export const getLeads = () => read(KEY, []);
export const getLead = (id) => getLeads().find((l) => l.id === id) || null;
const saveLeads = (list) => write(KEY, list);
const patchLead = (id, fn) => {
  const list = getLeads();
  const l = list.find((x) => x.id === id);
  if (!l) throw fail('Lead not found.');
  const next = fn(l);
  saveLeads(list.map((x) => (x.id === id ? next : x)));
  return next;
};

/** New lead from any source. Duplicates (same email, still open) are merged into the existing lead. */
export function createLead({ name, company = '', email = '', phone = '', source, partnerId = null, note = '', package: pkg = '', tool = null, sentBy = null, value = 0, trn = '', tradeLicense = '' }) {
  const list = getLeads();
  const em = String(email || '').trim().toLowerCase();
  const open = em && list.find((l) => l.email === em && !['Won', 'Lost'].includes(l.stage));
  if (open) {
    return patchLead(open.id, (l) => ({ ...l, notes: [...l.notes, { at: iso(), by: who(), text: `Contacted us again via ${source}. ${note}`.trim() }], tool: tool || l.tool }));
  }
  const lead = {
    id: `LD-${String(list.length + 2001)}`, name: name || company || em || phone, company, email: em, phone, trn, tradeLicense,
    source, partnerId, sentBy, stage: 'New', assigneeId: null, value: Number(value) || 0, package: pkg,
    createdAt: iso(), contactedAt: null, notes: note ? [{ at: iso(), by: who(), text: note }] : [], followUps: [], lossReason: '', tool,
    invite: null, unsubscribed: false, history: [{ at: iso(), action: 'Created from {source}', vars: { source }, by: who() }],
  };
  saveLeads([lead, ...list]);
  // Round robin among Sales: the lead and its first-contact task go to the same person.
  const tk = createTask({ type: source === 'Enterprise' ? 'enterprise-quote' : 'lead-contact', team: 'Sales', ref: { kind: 'lead', id: lead.id, name: lead.company || lead.name } });
  return patchLead(lead.id, (l) => ({ ...l, assigneeId: tk.assigneeId }));
}

export function setLeadStage(id, stage, { lossReason = '', note = '' } = {}) {
  if (stage === 'Lost' && !lossReason) throw fail('Choose a reason for the loss.');
  const before = getLead(id)?.stage;
  const l = patchLead(id, (x) => ({ ...x, stage, lossReason: stage === 'Lost' ? lossReason : x.lossReason, contactedAt: x.contactedAt || (stage !== 'New' ? iso() : null), closedAt: ['Won', 'Lost'].includes(stage) ? iso() : null, history: [...x.history, { at: iso(), action: 'Stage: {from} → {to}', vars: { from: before, to: stage }, note, by: who() }] }));
  if (stage !== 'New') completeTasksFor(id, ['lead-contact']);
  if (['Won', 'Lost'].includes(stage)) completeTasksFor(id);
  return l;
}

export function addLeadNote(id, text) {
  if (!text?.trim()) return null;
  return patchLead(id, (l) => ({ ...l, contactedAt: l.contactedAt || iso(), notes: [...l.notes, { at: iso(), by: who(), text }] }));
}
export function markContacted(id) {
  completeTasksFor(id, ['lead-contact']);
  return patchLead(id, (l) => ({ ...l, contactedAt: l.contactedAt || iso(), history: [...l.history, { at: iso(), action: 'First contact made', by: who() }] }));
}
export function addFollowUp(id, { dueAt, text }) {
  if (!dueAt) throw fail('Choose a date for the follow-up.');
  return patchLead(id, (l) => ({ ...l, followUps: [...l.followUps, { id: `fu-${Date.now().toString(36)}`, dueAt, text, done: false }] }));
}
export const toggleFollowUp = (id, fuId) => patchLead(id, (l) => ({ ...l, followUps: l.followUps.map((f) => (f.id === fuId ? { ...f, done: !f.done } : f)) }));
export function reassignLead(id, staffId) {
  const before = getLead(id)?.assigneeId;
  addAudit({ area: 'CRM', action: 'Lead reassigned', entity: id, before, after: staffId });
  return patchLead(id, (l) => ({ ...l, assigneeId: staffId }));
}

// ---------- Invitations (CRM-04, CRM-05, REG-01) ----------
const token = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

/** Prefilled registration link for a lead. Status: Sent → Opened → Registered. */
export function sendInvite(id) {
  const l = getLead(id);
  const tk = l.invite?.token || token();
  const link = `${window.location.origin}/register?invite=${tk}`;
  sendRaw({ to: { name: l.name, email: l.email }, subject: 'Invitation to Model E-Invoice', text: `Dear ${l.name}, your account is ready to complete: ${link}` });
  return patchLead(id, (x) => ({ ...x, invite: { token: tk, link, status: 'Sent', sentAt: iso() }, history: [...x.history, { at: iso(), action: 'Invitation sent', by: who() }] }));
}
export const leadByInvite = (tk) => getLeads().find((l) => l.invite?.token === tk) || null;
export function inviteOpened(tk) {
  const l = leadByInvite(tk);
  if (!l || l.invite.status !== 'Sent') return l;
  return patchLead(l.id, (x) => ({ ...x, invite: { ...x.invite, status: 'Opened', openedAt: iso() } }));
}
export function inviteRegistered(tk, userId) {
  const l = leadByInvite(tk);
  if (!l) return null;
  return patchLead(l.id, (x) => ({ ...x, stage: 'Won', closedAt: iso(), userId, invite: { ...x.invite, status: 'Registered', registeredAt: iso() }, history: [...x.history, { at: iso(), action: 'Registered from the invitation', by: x.name }] }));
}

/** Excel import of Model's existing clients: one lead each, source "Existing Model client". */
export async function importClients(rows, { sendInvites = true } = {}) {
  await delay(500);
  const existing = new Set(getUsers().map((u) => u.email.toLowerCase()));
  const res = { added: 0, skipped: [], invited: 0 };
  rows.forEach((r, i) => {
    const email = String(r.Email || r.email || '').trim().toLowerCase();
    const company = r.Company || r.company || r['Company name'] || '';
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { res.skipped.push({ row: i + 2, reason: 'No valid email' }); return; }
    if (existing.has(email)) { res.skipped.push({ row: i + 2, reason: 'Already a customer' }); return; }
    const l = createLead({ name: r.Name || r.name || r['Contact name'] || company, company, email, phone: String(r.Phone || r.phone || ''), source: 'Existing Model client', trn: String(r.TRN || r.trn || ''), tradeLicense: String(r['Trade licence'] || r.licence || '') });
    res.added += 1;
    if (sendInvites) { sendInvite(l.id); res.invited += 1; }
  });
  addAudit({ area: 'CRM', action: 'Clients imported from Excel', entity: `${res.added} leads`, before: null, after: res });
  return res;
}

// ---------- Marketing (CRM-06) ----------
export const getCampaigns = () => read(CAMP_KEY, []);
export function audienceFor({ stages = [], sources = [] }) {
  return getLeads().filter((l) => l.email && (!stages.length || stages.includes(l.stage)) && (!sources.length || sources.includes(l.source)));
}
export async function sendCampaign({ name, subjectEn, bodyEn, bodyAr, stages, sources }) {
  await delay(600);
  if (!name || !bodyEn) throw fail('Enter a name and the English text.');
  const all = audienceFor({ stages, sources });
  const to = all.filter((l) => !l.unsubscribed);
  to.forEach((l) => sendRaw({ to: { name: l.name, email: l.email }, subject: subjectEn || name, text: `${bodyEn}\n\n— Unsubscribe: ${window.location.origin}/unsubscribe?l=${l.id}` }));
  const c = { id: `CMP-${String(getCampaigns().length + 101)}`, name, subjectEn, bodyEn, bodyAr, stages, sources, sent: to.length, excluded: all.length - to.length, at: iso(), by: who() };
  write(CAMP_KEY, [c, ...getCampaigns()]);
  return c;
}
export function unsubscribe(leadId) {
  const l = getLead(leadId);
  if (!l) return null;
  return patchLead(leadId, (x) => ({ ...x, unsubscribed: true, unsubscribedAt: iso(), history: [...x.history, { at: iso(), action: 'Unsubscribed from marketing', by: x.name }] }));
}

// ---------- Reports ----------
export function crmReport() {
  const leads = getLeads();
  const bySource = Object.fromEntries(LEAD_SOURCES.map((s) => [s, leads.filter((l) => l.source === s)]));
  return {
    total: leads.length,
    byStage: Object.fromEntries(LEAD_STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length])),
    bySource: Object.entries(bySource).map(([source, list]) => ({ source, leads: list.length, won: list.filter((l) => l.stage === 'Won').length, lost: list.filter((l) => l.stage === 'Lost').length, conversion: list.length ? list.filter((l) => l.stage === 'Won').length / list.length : 0 })),
    lossReasons: leads.filter((l) => l.stage === 'Lost').reduce((acc, l) => ({ ...acc, [l.lossReason]: (acc[l.lossReason] || 0) + 1 }), {}),
  };
}
