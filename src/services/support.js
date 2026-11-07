// Support tickets: raised by customers from their dashboard or by visitors through the contact form.
// The system admin answers them and moves them through Open → In progress → Resolved.
import { read, write, fail } from './api';
import { addLog } from './logs';
import { notify } from './notifications';

export const TICKETS_KEY = 'mei_tickets';
export const TICKET_STATUSES = ['Open', 'In progress', 'Waiting for customer', 'Resolved'];
export const TICKET_CATEGORIES = ['Technical', 'Billing', 'Integration / API', 'Account', 'Sales enquiry'];
export const TICKET_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
export const TICKET_TEAMS = ['Support team', 'Technical team', 'Billing team', 'Sales team'];

export const getTickets = () => read(TICKETS_KEY, []).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
const save = (list) => write(TICKETS_KEY, list);
const nextId = (list) => `TCK-${String(1000 + list.length + 1)}`;

export function createTicket({ userId = null, company = '', name = '', email = '', subject, category = 'Technical', priority = 'Normal', message, source = 'Dashboard' }) {
  if (!String(subject || '').trim()) throw fail('Subject is required.');
  if (!String(message || '').trim()) throw fail('Describe the problem.');
  const list = read(TICKETS_KEY, []);
  const at = new Date().toISOString();
  const tk = { id: nextId(list), userId, company, name, email, subject: subject.trim(), category, priority, status: 'Open', source, createdAt: at, updatedAt: at,
    messages: [{ from: 'customer', name, text: message.trim(), at }] };
  save([tk, ...list]);
  addLog({ type: 'activity', userId, company, action: 'Support ticket opened', details: '{id} · {subject}', vars: { id: tk.id, subject: tk.subject } });
  return tk;
}

export function replyTicket(id, { from, name, text, status }) {
  if (!String(text || '').trim() && !status) throw fail('Write a reply.');
  const list = read(TICKETS_KEY, []);
  const tk = list.find((x) => x.id === id);
  if (!tk) throw fail('Ticket not found.');
  const at = new Date().toISOString();
  if (String(text || '').trim()) tk.messages = [...tk.messages, { from, name, text: text.trim(), at }];
  if (status) tk.status = status;
  else if (from === 'support' && tk.status === 'Open') tk.status = 'In progress';
  else if (from === 'customer' && tk.status === 'Waiting for customer') tk.status = 'In progress';
  tk.updatedAt = at;
  save(list);
  if (from === 'support' && tk.userId) {
    notify(tk.userId, { level: tk.status === 'Resolved' ? 'success' : 'info', key: tk.status === 'Resolved' ? 'Support resolved ticket {id}: {subject}' : 'Support replied to ticket {id}: {subject}', vars: { id: tk.id, subject: tk.subject }, link: 'support' });
  }
  return tk;
}

/** Change fields on one or more tickets. Each change is kept in the ticket's activity trail. */
export function updateTickets(ids, patch, by = 'MEI Support') {
  const list = read(TICKETS_KEY, []);
  const at = new Date().toISOString();
  const changed = [];
  list.forEach((tk) => {
    if (!ids.includes(tk.id)) return;
    const notes = Object.entries(patch).filter(([k, v]) => tk[k] !== v).map(([k, v]) => ({ field: k, from: tk[k] ?? '', to: v }));
    if (!notes.length) return;
    Object.assign(tk, patch, { updatedAt: at });
    tk.activity = [...(tk.activity || []), ...notes.map((n) => ({ ...n, by, at }))];
    changed.push(tk);
  });
  save(list);
  changed.forEach((tk) => {
    if (patch.status === 'Resolved' && tk.userId) notify(tk.userId, { level: 'success', key: 'Support resolved ticket {id}: {subject}', vars: { id: tk.id, subject: tk.subject }, link: 'support' });
  });
  if (changed.length) addLog({ type: 'activity', action: 'Support tickets updated', details: '{n} ticket(s) · {fields}', vars: { n: changed.length, fields: Object.keys(patch).join(', ') } });
  return changed.length;
}

export const setTicket = (id, patch) => updateTickets([id], patch);

export function deleteTickets(ids) {
  const list = read(TICKETS_KEY, []);
  const keep = list.filter((x) => !ids.includes(x.id));
  save(keep);
  addLog({ type: 'activity', action: 'Support tickets deleted', details: '{ids}', vars: { ids: ids.join(', ') } });
  return list.length - keep.length;
}

export function ticketStats() {
  const list = getTickets();
  const open = list.filter((t) => t.status !== 'Resolved');
  const resolved = list.filter((t) => t.status === 'Resolved');
  const firstReply = list.map((t) => { const r = t.messages.find((m) => m.from === 'support'); return r ? (new Date(r.at) - new Date(t.createdAt)) / 3600000 : null; }).filter((x) => x !== null);
  return {
    total: list.length, open: open.length, urgent: open.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length,
    unanswered: open.filter((t) => !t.messages.some((m) => m.from === 'support')).length, resolved: resolved.length,
    avgFirstReplyH: firstReply.length ? firstReply.reduce((a, b) => a + b, 0) / firstReply.length : null,
    byStatus: TICKET_STATUSES.map((s) => ({ label: s, value: list.filter((t) => t.status === s).length })),
    byCategory: TICKET_CATEGORIES.map((c) => ({ label: c, value: list.filter((t) => t.category === c).length })),
  };
}

/** Demo tickets so the admin support screen has content. */
export function seedTickets(users) {
  if (read(TICKETS_KEY, null)) return;
  const by = (id) => users.find((u) => u.id === id);
  const h = (n) => new Date(Date.now() - n * 3600000).toISOString();
  const T = (id, uid, subject, category, priority, status, ageH, msgs) => {
    const u = by(uid);
    return { id, userId: uid, company: u?.company?.name || '', name: u?.fullName || '', email: u?.email || '', subject, category, priority, status, source: 'Dashboard',
      createdAt: h(ageH), updatedAt: h(msgs.length ? msgs[msgs.length - 1][2] : ageH),
      messages: msgs.map(([from, text, a]) => ({ from, name: from === 'support' ? 'MEI Support' : u?.fullName, text, at: h(a) })) };
  };
  const list = [
    T('TCK-1012', 'seed-noor', 'Invoices stuck in "Retrying" since this morning', 'Technical', 'Urgent', 'Open', 1.5, [['customer', 'Five invoices have been retrying for 3 hours. Our customer is waiting for them.', 1.5]]),
    T('TCK-1011', 'seed-falcon', 'Refund request status', 'Billing', 'High', 'In progress', 5, [['customer', 'We submitted a refund request two days ago. Any update?', 5], ['support', 'We are reviewing it with finance and will update you today.', 3]]),
    T('TCK-1010', 'demo-user-0001', 'How do I add more users?', 'Account', 'Normal', 'Resolved', 30, [['customer', 'We need two more accountants on the platform.', 30], ['support', 'Your Standard package allows 5 users. Upgrade to Platinum for 10 users, or deactivate an inactive user.', 28]]),
    T('TCK-1009', 'seed-palm', 'API returns 401 from our ERP', 'Integration / API', 'High', 'Waiting for customer', 20, [['customer', 'Our ERP gets 401 Unauthorized when posting invoices.', 20], ['support', 'Please regenerate the API key in Invoices → API / SDK and send the request ID of a failed call.', 18]]),
    T('TCK-1008', 'seed-emfood', 'VAT invoice for last payment', 'Billing', 'Low', 'Resolved', 70, [['customer', 'Please send the tax invoice for our renewal.', 70], ['support', 'Sent to your email. You can also download it from Plan & billing.', 66]]),
    T('TCK-1007', 'seed-cedar', 'Customer rejected: Peppol ID not found', 'Technical', 'Normal', 'Open', 9, [['customer', 'Qvalia says the buyer endpoint is not registered. What should we do?', 9]]),
    T('TCK-1006', 'seed-sand', 'Excel upload: dates read wrongly', 'Technical', 'Normal', 'In progress', 26, [['customer', 'Our Excel dates show as numbers after upload.', 26], ['support', 'Please use YYYY-MM-DD text or the template. We are checking your file.', 24]]),
    T('TCK-1005', 'seed-atlas', 'Upgrade to Platinum mid-month', 'Billing', 'Normal', 'Resolved', 120, [['customer', 'If we upgrade now, how much do we pay?', 120], ['support', 'Only the difference for the remaining days. The cart shows the exact amount before you pay.', 118]]),
    T('TCK-1004', 'seed-gulf', 'Need ERP connector for Tally', 'Sales enquiry', 'Low', 'Open', 50, [['customer', 'Do you support Tally Prime integration?', 50]]),
    T('TCK-1003', 'seed-xyz', 'Change company legal name', 'Account', 'Normal', 'Resolved', 200, [['customer', 'Our trade licence name changed.', 200], ['support', 'Done. New invoices use the new legal name.', 196]]),
  ];
  write(TICKETS_KEY, list);
}
