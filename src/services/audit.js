// Audit trail (ADM-06): who did what, when, with the value before and after.
// Append-only: this module has no update or delete. The real backend keeps it in a table the app
// cannot UPDATE or DELETE (database permissions), and the API exposes read only.
import { read, write } from './api';

const KEY = 'mei_audit';

const actorFromSession = () => {
  const s = read('mei_session', null);
  if (!s) return { id: null, name: 'System' };
  if (s.member) return { id: s.member.id, name: s.member.name, kind: 'customer' };
  if (s.partnerUser) return { id: s.partnerUser.id, name: s.partnerUser.name, kind: 'partner' };
  return { id: s.user?.id, name: s.user?.fullName || 'System', kind: s.user?.role === 'Staff' || s.user?.role === 'SuperAdmin' ? 'staff' : 'customer' };
};

const clip = (v) => {
  if (v === undefined) return null;
  try {
    const s = JSON.stringify(v);
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  } catch { return String(v); }
};

/** Record one operation. `before` / `after` can be any value; they are stored as JSON text. */
export function addAudit({ area, action, entity = '', before, after, actor, vars }) {
  const list = read(KEY, []);
  const who = actor || actorFromSession();
  list.unshift({
    id: `AU-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    at: new Date().toISOString(),
    actor: who.name, actorId: who.id, actorKind: who.kind || 'system',
    area, action, entity, vars: vars || {},
    before: clip(before), after: clip(after),
  });
  write(KEY, list.slice(0, 3000));
}

export const getAudit = () => read(KEY, []);
