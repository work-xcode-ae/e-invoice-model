// Task engine for Model staff (ADM-02, ADM-03, BR-22).
// Every business event creates a task for a team. Tasks are assigned in turn (round robin) among the
// active members of that team, carry a deadline in working hours, and are escalated to the manager when late.
import { read, write, fail } from './api';
import { addAudit } from './audit';
import { getPlatform } from './platform';
import { activeStaffWithRole, getStaff, getStaffById } from './staff';

const KEY = 'mei_tasks';
const RR_KEY = 'mei_round_robin';
const NOTES_KEY = 'mei_staff_notes';
const iso = (d = new Date()) => new Date(d).toISOString();

export const TASK_TYPES = {
  'docs-review': { team: 'Customer Service', label: 'Review documents of a new customer', hours: 'cs' },
  'docs-missing': { team: 'Customer Service', label: 'Complete missing documents with the customer', hours: 8 },
  linking: { team: 'Customer Service', label: 'Link the customer and retrieve the Peppol ID', hours: 8 },
  'peppol-failed': { team: 'Customer Service', label: 'Peppol ID retrieval failed', hours: 4 },
  disconnect: { team: 'Customer Service', label: 'Customer request: re-verify, unlink or move provider', hours: 4 },
  'renewal-failed': { team: 'Customer Service', label: 'Follow up a failed renewal payment', hours: 8 },
  'refund-approval': { team: 'Manager', label: 'Approve or reject a refund request', hours: 8 },
  'bank-transfer': { team: 'Manager', label: 'Confirm a bank transfer', hours: 8 },
  'integration-error': { team: 'IT', label: 'Integration error', hours: 4 },
  'einvoice-failed': { team: 'IT', label: 'Model e-invoice was not sent', hours: 4 },
  'lead-contact': { team: 'Sales', label: 'First contact with a new lead', hours: 'lead' },
  'enterprise-quote': { team: 'Sales', label: 'Enterprise quote request', hours: 'lead' },
  'partner-application': { team: 'Manager', label: 'Review a partner application', hours: 16 },
  'statement-approval': { team: 'Manager', label: 'Approve a commission statement', hours: 16 },
  'partner-objection': { team: 'Manager', label: 'Partner objected to a statement', hours: 8 },
  'consulting-request': { team: 'Customer Service', label: 'Consulting service request', hours: 8 },
  'reconciliation-diff': { team: 'Manager', label: 'Reconciliation difference with the technical partner', hours: 16 },
  'ad-approval': { team: 'Manager', label: 'Approve an advertisement', hours: 16 },
  'licence-expiry': { team: 'Customer Service', label: 'Customer trade licence expires soon', hours: 16 },
  ticket: { team: 'Customer Service', label: 'Support ticket', hours: 8 },
};

// ---------- Working hours ----------
/** Adds working hours (Settings → Working hours, Monday–Friday 09:00–18:00 by default). */
export function addWorkingHours(start, hours) {
  const wh = getPlatform().workHours;
  let d = new Date(start);
  let left = hours * 60; // minutes
  const isWorkDay = (x) => wh.days.includes(x.getDay());
  const guard = 10000;
  for (let i = 0; i < guard && left > 0; i++) {
    if (!isWorkDay(d) || d.getHours() >= wh.end) { d.setDate(d.getDate() + 1); d.setHours(wh.start, 0, 0, 0); continue; }
    if (d.getHours() < wh.start) { d.setHours(wh.start, 0, 0, 0); continue; }
    const endOfDay = new Date(d); endOfDay.setHours(wh.end, 0, 0, 0);
    const avail = (endOfDay - d) / 60000;
    if (left <= avail) { d = new Date(d.getTime() + left * 60000); left = 0; } else { left -= avail; d = endOfDay; }
  }
  return d;
}

const slaHours = (type) => {
  const def = TASK_TYPES[type];
  const du = getPlatform().durations;
  if (def?.hours === 'cs') return Number(du.csFirstContactHours) || 4;
  if (def?.hours === 'lead') return (Number(du.leadFirstContactDays) || 1) * (getPlatform().workHours.end - getPlatform().workHours.start);
  return def?.hours || 8;
};

// ---------- Store ----------
export const getTasks = () => read(KEY, []);
const saveTasks = (list) => write(KEY, list);

/** Next active member of a team, in turn. No one in the team → the manager. */
export function nextAssignee(team) {
  const members = activeStaffWithRole(team);
  if (!members.length) return activeStaffWithRole('Manager')[0]?.id || null;
  const rr = read(RR_KEY, {});
  const idx = (rr[team] ?? -1) + 1;
  const pick = members[idx % members.length];
  write(RR_KEY, { ...rr, [team]: idx % members.length });
  return pick.id;
}

export function notifyStaff(staffId, { key, vars = {}, link = '/admin/tasks', level = 'info' }) {
  if (!staffId) return;
  const all = read(NOTES_KEY, {});
  const list = all[staffId] || [];
  write(NOTES_KEY, { ...all, [staffId]: [{ id: `sn-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`, key, vars, link, level, at: iso(), read: false }, ...list].slice(0, 100) });
}
export const staffNotes = (staffId) => read(NOTES_KEY, {})[staffId] || [];
export const markStaffNotesRead = (staffId) => {
  const all = read(NOTES_KEY, {});
  write(NOTES_KEY, { ...all, [staffId]: (all[staffId] || []).map((n) => ({ ...n, read: true })) });
};

/**
 * Create a task for an event. `ref` = { kind, id, name } of the customer / lead / partner / item it is about.
 * Duplicate open tasks of the same type for the same item are not created again.
 */
export function createTask({ type, ref = {}, note = '', vars = {}, team: teamOverride, dueAt }) {
  const def = TASK_TYPES[type] || { team: teamOverride || 'Manager', label: type, hours: 8 };
  const team = teamOverride || def.team;
  const list = getTasks();
  const dup = list.find((x) => x.type === type && x.status !== 'Done' && x.ref?.id && x.ref.id === ref.id);
  if (dup) return dup;
  const assigneeId = nextAssignee(team);
  const created = new Date();
  const task = {
    id: `TSK-${String(list.length + 1001)}`,
    type, team, title: def.label, note, vars, ref,
    assigneeId, status: 'Open', createdAt: iso(created),
    dueAt: iso(dueAt || addWorkingHours(created, slaHours(type))),
    escalated: false,
    history: [{ at: iso(created), by: 'System', action: 'Created and assigned to {name}', vars: { name: getStaffById(assigneeId)?.name || '—' } }],
  };
  saveTasks([task, ...list]);
  notifyStaff(assigneeId, { key: 'New task: {title}', vars: { title: def.label } });
  return task;
}

const by = () => {
  const s = read('mei_session', null);
  return s?.user?.fullName || 'System';
};

function patchTask(id, fn) {
  const list = getTasks();
  const t = list.find((x) => x.id === id);
  if (!t) throw fail('Task not found.');
  const next = fn(t);
  saveTasks(list.map((x) => (x.id === id ? next : x)));
  return next;
}

export const startTask = (id) => patchTask(id, (t) => ({ ...t, status: 'In progress', startedAt: t.startedAt || iso(), history: [...t.history, { at: iso(), by: by(), action: 'Started' }] }));

export function completeTask(id, note = '') {
  return patchTask(id, (t) => ({ ...t, status: 'Done', doneAt: iso(), metSla: new Date() <= new Date(t.dueAt), history: [...t.history, { at: iso(), by: by(), action: 'Completed', note }] }));
}

/** Close every open task of a type for one item (the work was done elsewhere in the system). */
export function completeTasksFor(refId, types) {
  const list = getTasks();
  let changed = false;
  const next = list.map((t) => {
    if (t.status === 'Done' || t.ref?.id !== refId || (types && !types.includes(t.type))) return t;
    changed = true;
    return { ...t, status: 'Done', doneAt: iso(), metSla: new Date() <= new Date(t.dueAt), history: [...t.history, { at: iso(), by: by(), action: 'Completed' }] };
  });
  if (changed) saveTasks(next);
}

/** Manager: reassign by hand. */
export function reassignTask(id, staffId, note = '') {
  const t = patchTask(id, (x) => ({ ...x, assigneeId: staffId, history: [...x.history, { at: iso(), by: by(), action: 'Reassigned to {name}', vars: { name: getStaffById(staffId)?.name }, note }] }));
  notifyStaff(staffId, { key: 'Task {id} was assigned to you.', vars: { id } });
  addAudit({ area: 'Tasks', action: 'Task reassigned', entity: id, before: null, after: { to: getStaffById(staffId)?.name, note } });
  return t;
}

/** Any staff: transfer to another team, with a reason (required). */
export function transferTask(id, team, reason) {
  if (!reason || !reason.trim()) throw fail('Give a reason for the transfer.');
  const assigneeId = nextAssignee(team);
  const t = patchTask(id, (x) => ({ ...x, team, assigneeId, history: [...x.history, { at: iso(), by: by(), action: 'Transferred to {team}', vars: { team }, note: reason }] }));
  notifyStaff(assigneeId, { key: 'Task {id} was transferred to you.', vars: { id } });
  return t;
}

export function addTaskNote(id, note) {
  if (!note?.trim()) return null;
  return patchTask(id, (x) => ({ ...x, history: [...x.history, { at: iso(), by: by(), action: 'Note', note }] }));
}

/** Late tasks are escalated once to the manager(s) (BR-22). Runs on a timer and whenever tasks are read. */
export function checkEscalations() {
  const list = getTasks();
  const nowD = new Date();
  const late = list.filter((t) => t.status !== 'Done' && !t.escalated && new Date(t.dueAt) < nowD);
  if (!late.length) return 0;
  const managers = activeStaffWithRole('Manager');
  saveTasks(list.map((t) => (late.includes(t)
    ? { ...t, escalated: true, escalatedAt: iso(), history: [...t.history, { at: iso(), by: 'System', action: 'Escalated to the manager: deadline passed' }] }
    : t)));
  late.forEach((t) => managers.forEach((m) => notifyStaff(m.id, { level: 'danger', key: 'Task {id} is late and was escalated: {title}', vars: { id: t.id, title: t.title } })));
  return late.length;
}

/** ADM-03: when a staff account is deactivated, its open tasks go back to the queue and are reassigned. */
export function releaseTasksOf(staffId) {
  const list = getTasks();
  const mine = list.filter((t) => t.assigneeId === staffId && t.status !== 'Done');
  if (!mine.length) return 0;
  saveTasks(list.map((t) => {
    if (!mine.includes(t)) return t;
    const to = nextAssignee(t.team);
    notifyStaff(to, { key: 'Task {id} was assigned to you.', vars: { id: t.id } });
    return { ...t, assigneeId: to, history: [...t.history, { at: iso(), by: 'System', action: 'Returned to the queue (user deactivated) and assigned to {name}', vars: { name: getStaffById(to)?.name || '—' } }] };
  }));
  return mine.length;
}

/** KPI per staff member for a period (RPT-03). */
export function staffKpis(from, to) {
  const w = getPlatform().kpiWeights;
  const tasks = getTasks().filter((t) => (!from || t.createdAt >= from) && (!to || t.createdAt <= to));
  return getStaff().filter((s) => !s.roles.includes('Owner')).map((s) => {
    const mine = tasks.filter((t) => t.assigneeId === s.id);
    const done = mine.filter((t) => t.status === 'Done');
    const onTime = done.filter((t) => t.metSla).length;
    const esc = mine.filter((t) => t.escalated).length;
    const slaPct = done.length ? onTime / done.length : 0;
    const score = Math.round(Math.min(1, done.length / 10) * w.tasksDone + slaPct * w.slaMet + (mine.length ? 1 - esc / mine.length : 1) * w.escalations);
    return { id: s.id, name: s.name, roles: s.roles, assigned: mine.length, done: done.length, onTime, slaPct, escalated: esc, open: mine.length - done.length, score };
  }).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
}
