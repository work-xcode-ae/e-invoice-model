// What each role in a customer company can see and do (BRD section 4.2, v1.1: Manager, Accountant, Viewer).
// The person who registered the company is a Manager and cannot be removed.
export const ROLES = ['Manager', 'Accountant', 'Viewer'];
export const TEAM_ROLES = ['Manager', 'Accountant', 'Viewer'];

export const PERMISSIONS = [
  { id: 'dashboard', label: 'See the overview', roles: ['Manager', 'Accountant', 'Viewer'] },
  { id: 'usage', label: 'Usage and linking status', roles: ['Manager', 'Accountant', 'Viewer'], view: ['Viewer'] },
  { id: 'portal', label: 'Single sign-on to the billing portal', roles: ['Manager', 'Accountant'] },
  { id: 'modelInvoices', label: 'Model invoices and credit notes', roles: ['Manager', 'Accountant'] },
  { id: 'billing', label: 'Package, upgrade, downgrade and cancellation', roles: ['Manager'] },
  { id: 'card', label: 'Saved card and auto-renewal', roles: ['Manager'] },
  { id: 'refund', label: 'Request a refund', roles: ['Manager'] },
  { id: 'linking', label: 'Re-verify and unlink', roles: ['Manager'] },
  { id: 'users', label: 'Users and roles', roles: ['Manager'] },
  { id: 'api', label: 'API keys', roles: ['Manager'] },
  { id: 'support', label: 'Tickets and consulting requests', roles: ['Manager', 'Accountant'] },
  { id: 'company', label: 'Company details and documents', roles: ['Manager'] },
  { id: 'partnerConsent', label: 'Allow the partner to see invoices', roles: ['Manager'] },
  // Phase 2 (customer invoicing in the platform, hidden by default — CUS-07)
  { id: 'reports', label: 'See reports and export them', roles: ['Manager', 'Accountant', 'Viewer'], phase2: true },
  { id: 'invoices.create', label: 'Create, upload, resend and cancel invoices', roles: ['Manager', 'Accountant'], phase2: true },
  { id: 'masterdata.edit', label: 'Add, edit and import customers, categories and items', roles: ['Manager', 'Accountant'], phase2: true },
];

/** Older data used Owner / Admin / User: Owner and Admin become Manager, User becomes Accountant. */
export const normalizeRole = (r) => (r === 'Owner' || r === 'Admin' ? 'Manager' : r === 'User' || !r ? 'Accountant' : r);
export const can = (role, perm) => !!PERMISSIONS.find((p) => p.id === perm)?.roles.includes(normalizeRole(role));
export const viewOnly = (role, perm) => !!PERMISSIONS.find((p) => p.id === perm)?.view?.includes(normalizeRole(role));
export const ROLE_HINT = {
  Manager: 'Everything: package and payment, users, API keys, linking and refunds.',
  Accountant: 'Usage, Model invoices, billing portal, tickets and consulting requests.',
  Viewer: 'Read only: usage and linking status.',
};
