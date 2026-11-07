// What each role in a customer company can see and do.
// Owner = the person who registered and pays. Team members get one of the other roles.
export const ROLES = ['Owner', 'Admin', 'Accountant', 'Viewer'];
export const TEAM_ROLES = ['Admin', 'Accountant', 'Viewer'];

export const PERMISSIONS = [
  { id: 'dashboard', label: 'See the overview and invoices', roles: ['Owner', 'Admin', 'Accountant', 'Viewer'] },
  { id: 'reports', label: 'See reports and export them', roles: ['Owner', 'Admin', 'Accountant', 'Viewer'] },
  { id: 'invoices.create', label: 'Create, upload, resend and cancel invoices', roles: ['Owner', 'Admin', 'Accountant'] },
  { id: 'masterdata.edit', label: 'Add, edit and import customers, categories and items', roles: ['Owner', 'Admin', 'Accountant'] },
  { id: 'support', label: 'Open and answer support tickets', roles: ['Owner', 'Admin', 'Accountant'] },
  { id: 'api', label: 'Manage the API key', roles: ['Owner', 'Admin'] },
  { id: 'company', label: 'Edit company and bank details', roles: ['Owner', 'Admin'] },
  { id: 'users', label: 'Add, remove and change users', roles: ['Owner', 'Admin'] },
  { id: 'billing', label: 'Buy, renew, upgrade and request refunds', roles: ['Owner'] },
];

/** Old data used 'User' for team members: treat it as Accountant. */
export const normalizeRole = (r) => (r === 'User' || !r ? 'Accountant' : r);
export const can = (role, perm) => !!PERMISSIONS.find((p) => p.id === perm)?.roles.includes(normalizeRole(role));
export const ROLE_HINT = {
  Owner: 'Full access, including billing.',
  Admin: 'Everything except billing.',
  Accountant: 'Invoices, customers, items, reports and support.',
  Viewer: 'Read only: invoices and reports.',
};
