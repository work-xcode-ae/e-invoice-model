// System admin → customer notifications (one company, a group, or everyone).
import { read, write, fail } from './api';
import { notify } from './notifications';
import { addLog } from './logs';
import { companyStats } from './reports';

export const BROADCASTS_KEY = 'mei_broadcasts';
export const AUDIENCES = [
  { id: 'all', label: 'All companies' },
  { id: 'active', label: 'Companies with an active package' },
  { id: 'package', label: 'Companies on a package' },
  { id: 'low', label: 'Companies with 20% or less left' },
  { id: 'expiring', label: 'Packages ending within 7 days' },
  { id: 'expired', label: 'Expired packages' },
  { id: 'selected', label: 'Selected companies' },
];
export const LINKS = [
  { id: '', label: 'No button' },
  { id: 'renew', label: 'Renew now' },
  { id: 'addon', label: 'Buy add-on' },
  { id: 'plan', label: 'View plan' },
  { id: 'invoices', label: 'View invoices' },
  { id: 'support', label: 'Open support' },
];

export const getBroadcasts = () => read(BROADCASTS_KEY, []);

/** Companies that a broadcast would reach. */
export function recipients({ audience, packageId, selected = [] }) {
  const in7 = Date.now() + 7 * 86400000;
  return companyStats().filter((c) => {
    switch (audience) {
      case 'all': return true;
      case 'active': return c.status === 'Active';
      case 'package': return c.packageId === packageId && c.status === 'Active';
      case 'low': return c.status === 'Active' && c.limit && c.usedPct >= 80;
      case 'expiring': return c.status === 'Active' && c.endDate && new Date(c.endDate) <= in7;
      case 'expired': return c.status === 'Expired' || c.status === 'Refunded (Locked)';
      case 'selected': return selected.includes(c.userId);
      default: return false;
    }
  });
}

export function sendBroadcast({ audience, packageId, selected, level = 'info', title, message, link = '' }) {
  if (!String(title || '').trim()) throw fail('Title is required.');
  if (!String(message || '').trim()) throw fail('Message is required.');
  const to = recipients({ audience, packageId, selected });
  if (!to.length) throw fail('No companies match this audience.');
  const text = `${title.trim()} — ${message.trim()}`;
  to.forEach((c) => notify(c.userId, { level, key: text, link: link || null }));
  const b = { id: `BC-${Date.now().toString(36).toUpperCase()}`, at: new Date().toISOString(), audience, packageId: packageId || null, level, title: title.trim(), message: message.trim(), link, count: to.length, companies: to.slice(0, 50).map((c) => c.company) };
  write(BROADCASTS_KEY, [b, ...getBroadcasts()].slice(0, 100));
  addLog({ type: 'activity', action: 'Notification sent', details: '{title} → {n} companies', vars: { title: b.title, n: to.length } });
  return b;
}
