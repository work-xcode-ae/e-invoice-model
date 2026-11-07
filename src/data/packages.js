// Subscription packages — mirrors the "Browse Packages" step of the customer journey.
// Replace with an API call (GET /api/packages) once the backend is ready.

// Set by services/tax.js from the system admin's Tax & VAT settings (live binding: importers see changes).
export let VAT_RATE = 0.05;
export let PRICES_INCLUDE_VAT = false;
export const setVatRate = (r) => { VAT_RATE = r; };
export const setPricesIncludeVat = (v) => { PRICES_INCLUDE_VAT = v; };
export const CURRENCY = 'AED';

export const packages = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'For freelancers and small shops starting with e-invoicing.',
    price: 50,
    transactions: 100,
    users: 2,
    support: 'Standard support',
    features: [
      'Manual invoice entry',
      'Excel bulk upload',
      'Peppol PINT AE delivery',
      'FTA Tax Data reporting',
      'Transaction & user logs',
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'For growing SMEs issuing invoices every day.',
    price: 100,
    transactions: 500,
    users: 5,
    support: 'Priority support',
    popular: true,
    features: [
      'Everything in Basic',
      'REST API & SDK access',
      'Products, customers & categories',
      'CSV export for reconciliation',
      'Automatic retry & status tracking',
    ],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    tagline: 'For high-volume businesses and ERP integrations.',
    price: 200,
    transactions: 1000,
    users: 10,
    support: 'Dedicated support',
    features: [
      'Everything in Standard',
      'ERP connectors (Business Central, Xero…)',
      'SFTP batch upload on request',
      'Dedicated account manager',
      'Advanced reports & dashboards',
    ],
  },
];

// Billing periods — matches "Renew Package (New Period)" options (1 / 2 / 3 months).
export const billingPeriods = [
  { months: 1, label: '1 Month', factor: 1 },
  { months: 2, label: '2 Months', factor: 1.8, save: '10%' },
  { months: 3, label: '3 Months', factor: 2.5, save: '17%' },
];

// Add-on transactions — valid until the current package end date (same period).
export const addOns = [
  { id: 'addon-50', transactions: 50, price: 50 },
  { id: 'addon-100', transactions: 100, price: 90 },
  { id: 'addon-250', transactions: 250, price: 200 },
];

export const DEFAULT_ADDONS = addOns.map((a) => ({ ...a }));
export const getPackage = (id) => packages.find((p) => p.id === id);

// ----- Admin overrides (price / limits / availability), stored locally in this demo -----
export const PACKAGES_KEY = 'mei_packages';
export const DEFAULT_PACKAGES = packages.map((p) => ({ ...p, features: [...p.features] }));

/** Re-applies admin overrides onto the shared `packages` array (mutated in place so every import sees it). */
export function applyPackageOverrides() {
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem(PACKAGES_KEY) || '{}'); } catch { /* ignore */ }
  DEFAULT_PACKAGES.forEach((def, i) => {
    Object.assign(packages[i], def, { features: [...def.features], active: true }, overrides[def.id] || {});
  });
  DEFAULT_ADDONS.forEach((def, i) => { Object.assign(addOns[i], def, (overrides._addons || {})[def.id] || {}); });
}
applyPackageOverrides();
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === PACKAGES_KEY) applyPackageOverrides(); });

export const activePackages = () => packages.filter((p) => p.active !== false);

export const periodPrice = (pkg, months = 1) => {
  const period = billingPeriods.find((b) => b.months === months) || billingPeriods[0];
  return Math.round(pkg.price * period.factor);
};

// Currency label follows the UI language (set by LanguageProvider).
let currencyLang = 'en';
export const setCurrencyLang = (l) => { currencyLang = l; };

export const formatMoney = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const decimals = Math.round(abs * 100) % 100 === 0 ? 0 : 2;
  const num = abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
  const sign = v < 0 ? '−' : '';
  return currencyLang === 'ar' ? `${sign}${num} درهم` : `${sign}${CURRENCY} ${num}`;
};
