// Model staff (ADM-01): five roles with the permission matrix of BRD section 4.1, plus custom roles
// created in Settings. One staff member can hold several roles. Two-factor sign-in is mandatory.
import { read, write, fail, delay } from './api';
import { addAudit } from './audit';

export const STAFF_KEY = 'mei_staff';
export const ROLES_KEY = 'mei_staff_roles';

export const STAFF_ROLES = ['Manager', 'Customer Service', 'IT', 'Sales', 'Owner'];

// Levels: full · view · approve (decides) · request (raises, the manager approves) · tech (technical part) · own (own tasks only)
export const STAFF_PERMS = [
  { id: 'staff', label: 'Staff and roles' },
  { id: 'assign', label: 'Distribute and reassign tasks' },
  { id: 'leads', label: 'Leads and quotes' },
  { id: 'documents', label: 'Review and complete documents' },
  { id: 'linking', label: 'Linking, Peppol ID and activation' },
  { id: 'disconnect', label: 'Unlinking and moving provider' },
  { id: 'tickets', label: 'Support tickets' },
  { id: 'packages', label: 'Packages, prices, offers and special discount' },
  { id: 'bank', label: 'Bank transfer confirmation and manual invoices' },
  { id: 'refunds', label: 'Refunds and credit notes' },
  { id: 'partners', label: 'Partners, commission plans and payouts' },
  { id: 'integrations', label: 'Integrations, keys and error logs' },
  { id: 'settings', label: 'General settings' },
  { id: 'reports', label: 'Reports' },
  { id: 'owner', label: 'Owner dashboard' },
  { id: 'audit', label: 'Audit log' },
];

export const DEFAULT_MATRIX = {
  Manager: { staff: 'full', assign: 'full', leads: 'view', documents: 'full', linking: 'full', disconnect: 'approve', tickets: 'full', packages: 'full', bank: 'full', refunds: 'approve', partners: 'full', integrations: 'view', settings: 'full', reports: 'full', owner: 'full', audit: 'full' },
  'Customer Service': { documents: 'full', linking: 'full', disconnect: 'full', tickets: 'full', refunds: 'request', reports: 'own' },
  IT: { tickets: 'tech', integrations: 'full', settings: 'tech', reports: 'tech', audit: 'view' },
  Sales: { leads: 'full', reports: 'own' },
  Owner: { staff: 'view', assign: 'view', leads: 'view', documents: 'view', linking: 'view', disconnect: 'view', tickets: 'view', packages: 'view', bank: 'view', refunds: 'view', partners: 'view', reports: 'full', owner: 'full', audit: 'view' },
};

const LEVEL_RANK = { view: 1, own: 1, tech: 2, request: 2, approve: 3, full: 4 };

/** Built-in roles plus the ones created in Settings → Roles. */
export function roleMatrix() {
  const custom = read(ROLES_KEY, {});
  return { ...DEFAULT_MATRIX, ...custom };
}
export const allRoleNames = () => Object.keys(roleMatrix());

export function saveCustomRole(name, perms) {
  if (!name || !name.trim()) throw fail('Enter a role name.');
  if (DEFAULT_MATRIX[name]) throw fail('This is a built-in role. Choose another name.');
  const custom = read(ROLES_KEY, {});
  const before = custom[name] || null;
  write(ROLES_KEY, { ...custom, [name.trim()]: perms });
  addAudit({ area: 'Staff', action: before ? 'Role changed' : 'Role created', entity: name, before, after: perms });
}
export function deleteCustomRole(name) {
  const custom = read(ROLES_KEY, {});
  if (!custom[name]) return;
  if (getStaff().some((s) => s.roles.includes(name))) throw fail('Remove this role from every staff member first.');
  const { [name]: removed, ...rest } = custom;
  write(ROLES_KEY, rest);
  addAudit({ area: 'Staff', action: 'Role deleted', entity: name, before: removed, after: null });
}

/** Highest level a set of roles gives for one permission (null = no access). */
export function levelFor(roles, perm) {
  const m = roleMatrix();
  let best = null;
  (roles || []).forEach((r) => {
    const lv = m[r]?.[perm];
    if (lv && (!best || LEVEL_RANK[lv] > LEVEL_RANK[best])) best = lv;
  });
  return best;
}

export const DEFAULT_STAFF = [
  { id: 'admin-0001', name: 'MEI Administrator', email: 'admin@modelfc.ae', password: 'Admin@2026', roles: ['Manager'], status: 'Active' },
  { id: 'st-cs1', name: 'Noura Al Hammadi', email: 'cs@modelfc.ae', password: 'Demo@2026', roles: ['Customer Service'], status: 'Active' },
  { id: 'st-cs2', name: 'Ahmed Fathy', email: 'cs2@modelfc.ae', password: 'Demo@2026', roles: ['Customer Service'], status: 'Active' },
  { id: 'st-it', name: 'Rami Kassem', email: 'it@modelfc.ae', password: 'Demo@2026', roles: ['IT'], status: 'Active' },
  { id: 'st-sales1', name: 'Lina Haddad', email: 'sales@modelfc.ae', password: 'Demo@2026', roles: ['Sales'], status: 'Active' },
  { id: 'st-sales2', name: 'Yousef Karim', email: 'sales2@modelfc.ae', password: 'Demo@2026', roles: ['Sales'], status: 'Active' },
  { id: 'st-owner', name: 'Hussain Salim', email: 'owner@modelfc.ae', password: 'Demo@2026', roles: ['Owner'], status: 'Active' },
];

export const getStaff = () => {
  const list = read(STAFF_KEY, null);
  if (list) return list;
  write(STAFF_KEY, DEFAULT_STAFF);
  return DEFAULT_STAFF;
};
export const getStaffById = (id) => getStaff().find((s) => s.id === id) || null;
export const staffName = (id) => getStaffById(id)?.name || '—';
export const activeStaffWithRole = (role) => getStaff().filter((s) => s.status === 'Active' && s.roles.includes(role));
export const publicStaff = ({ password, ...s }) => s; // eslint-disable-line no-unused-vars

export async function addStaff({ name, email, roles }) {
  await delay(300);
  const list = getStaff();
  const em = String(email || '').trim().toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(em)) throw fail('Enter a name and a valid email.');
  if (!roles?.length) throw fail('Choose at least one role.');
  if (list.some((s) => s.email.toLowerCase() === em)) throw fail('A user with this email already exists.');
  const tempPassword = `Mei-${Math.random().toString(36).slice(2, 7)}${Math.floor(10 + Math.random() * 89)}`;
  const s = { id: `st-${Date.now().toString(36)}`, name, email: em, password: tempPassword, roles, status: 'Active', createdAt: new Date().toISOString() };
  write(STAFF_KEY, [...list, s]);
  addAudit({ area: 'Staff', action: 'Staff member added', entity: em, before: null, after: { name, roles } });
  return { ...publicStaff(s), tempPassword };
}

export function updateStaff(id, patch) {
  const list = getStaff();
  const before = list.find((s) => s.id === id);
  if (!before) throw fail('User not found.');
  if (patch.roles && !patch.roles.length) throw fail('Choose at least one role.');
  const after = { ...before, ...patch };
  write(STAFF_KEY, list.map((s) => (s.id === id ? after : s)));
  addAudit({ area: 'Staff', action: 'Staff member changed', entity: before.email, before: { roles: before.roles, status: before.status }, after: { roles: after.roles, status: after.status } });
  return after;
}
