// Subscription packages (BRD v1.1, BIL-01 / BIL-02). Values are placeholders until Model sends the
// quotation figures: the system admin edits them in Admin → Packages without any code change.
// Replace with an API call (GET /api/packages) once the backend is ready.

// Set by services/tax.js from the system admin's Tax & VAT settings (live binding: importers see changes).
export let VAT_RATE = 0.05;
export let PRICES_INCLUDE_VAT = false;
export const setVatRate = (r) => { VAT_RATE = r; };
export const setPricesIncludeVat = (v) => { PRICES_INCLUDE_VAT = v; };
export const CURRENCY = 'AED';

/** Free documents every customer gets in each subscription year (BR-01). Overridden by Settings → Durations. */
export const FREE_DOCS_PER_YEAR = 100;

export const LINK_METHODS = ['Billing portal (web)', 'Excel upload', 'ERP API', 'SFTP'];

export const packages = [
  {
    id: 'freemium',
    name: 'Freemium',
    tagline: 'Start with the free yearly allowance and pay only for what you send.',
    taglineAr: '',
    price: 0,
    annualPrice: 0,
    transactions: 0,
    overagePrice: 1.5,
    setupFee: 0,
    setupFeeType: 'none',
    users: 1,
    entities: 1,
    linkMethods: ['Billing portal (web)'],
    support: 'Email support',
    consultingHours: 0,
    consultingDiscount: 0,
    features: ['100 free documents every subscription year', 'Peppol PINT AE delivery', 'FTA Tax Data reporting', 'Pay per extra document'],
    featuresAr: [],
  },
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'For small businesses sending a steady number of invoices.',
    taglineAr: '',
    price: 99,
    annualPrice: 990,
    transactions: 50,
    overagePrice: 1.25,
    setupFee: 250,
    setupFeeType: 'annual',
    users: 2,
    entities: 1,
    linkMethods: ['Billing portal (web)', 'Excel upload'],
    support: 'Standard support',
    consultingHours: 0,
    consultingDiscount: 5,
    features: ['Everything in Freemium', '50 documents every month', 'Unused documents carry over to year end', 'Excel bulk upload'],
    featuresAr: [],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing companies issuing invoices every day.',
    taglineAr: '',
    price: 249,
    annualPrice: 2490,
    transactions: 200,
    overagePrice: 1,
    setupFee: 500,
    setupFeeType: 'annual',
    users: 5,
    entities: 1,
    linkMethods: ['Billing portal (web)', 'Excel upload', 'ERP API'],
    support: 'Priority support',
    consultingHours: 1,
    consultingDiscount: 10,
    popular: true,
    features: ['Everything in Basic', '200 documents every month', 'ERP API access', '1 consulting hour per year'],
    featuresAr: [],
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'For high-volume businesses and several entities.',
    taglineAr: '',
    price: 499,
    annualPrice: 4990,
    transactions: 500,
    overagePrice: 0.75,
    setupFee: 1000,
    setupFeeType: 'one-time',
    users: 10,
    entities: 3,
    linkMethods: ['Billing portal (web)', 'Excel upload', 'ERP API', 'SFTP'],
    support: 'Dedicated support',
    consultingHours: 4,
    consultingDiscount: 20,
    features: ['Everything in Pro', '500 documents every month', 'Up to 3 entities', '4 consulting hours per year'],
    featuresAr: [],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Groups and large volumes: a contract and a package built for you.',
    taglineAr: '',
    custom: true,
    price: 0,
    annualPrice: 0,
    transactions: 0,
    overagePrice: 0,
    setupFee: 0,
    setupFeeType: 'one-time',
    users: 50,
    entities: 20,
    linkMethods: ['Billing portal (web)', 'Excel upload', 'ERP API', 'SFTP'],
    support: 'Account manager',
    consultingHours: 0,
    consultingDiscount: 25,
    features: ['Custom document volume', 'Multiple entities', 'Custom integration', 'Bank transfer payment'],
    featuresAr: [],
  },
];

/** Old package ids used before BRD v1.1 (demo data in existing browsers). */
const ALIASES = { standard: 'pro', platinum: 'premium' };

// Billing periods (BIL-02): monthly or annual. The annual price may not exceed 12 × monthly (BR-04).
export const billingPeriods = [
  { months: 1, label: 'Monthly' },
  { months: 12, label: 'Annual' },
];

// Add-ons were replaced by pay-per-document overage (BIL-05). Kept empty so old imports still work.
export const addOns = [];
export const DEFAULT_ADDONS = [];

/** Custom (Enterprise) packages created by the manager for one customer (BIL-11). */
export const CUSTOM_PACKAGES_KEY = 'mei_custom_packages';
const customPackages = () => {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PACKAGES_KEY) || '[]'); } catch { return []; }
};

export const getPackage = (id) => {
  const key = ALIASES[id] || id;
  return packages.find((p) => p.id === key) || customPackages().find((p) => p.id === key) || null;
};

// ----- Admin overrides (price / limits / availability / texts), stored locally in this demo -----
export const PACKAGES_KEY = 'mei_packages';
export const DEFAULT_PACKAGES = packages.map((p) => ({ ...p, features: [...p.features], featuresAr: [...(p.featuresAr || [])], linkMethods: [...p.linkMethods] }));

/** Re-applies admin overrides onto the shared `packages` array (mutated in place so every import sees it). */
export function applyPackageOverrides() {
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem(PACKAGES_KEY) || '{}'); } catch { /* ignore */ }
  // Packages the admin created are kept under _new.
  const extra = overrides._new || [];
  packages.length = DEFAULT_PACKAGES.length;
  DEFAULT_PACKAGES.forEach((def, i) => {
    packages[i] = packages[i] || {};
    Object.keys(packages[i]).forEach((k) => delete packages[i][k]);
    Object.assign(packages[i], def, { features: [...def.features], featuresAr: [...def.featuresAr], linkMethods: [...def.linkMethods], active: true }, overrides[def.id] || {});
  });
  extra.forEach((p) => packages.splice(packages.length - 1, 0, { active: true, ...p, ...(overrides[p.id] || {}) }));
}
applyPackageOverrides();
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === PACKAGES_KEY) applyPackageOverrides(); });

export const activePackages = () => packages.filter((p) => p.active !== false);

/** Price of a period: monthly price × months, or the annual price for 12 months. */
export const periodPrice = (pkg, months = 1) => {
  if (!pkg) return 0;
  if (Number(months) === 12) return Number(pkg.annualPrice) || Number(pkg.price) * 12;
  return Number(pkg.price) * Number(months || 1);
};

/** How much the annual price saves against 12 monthly payments, in % (0 when none). */
export const annualSaving = (pkg) => {
  const full = Number(pkg.price) * 12;
  if (!full || !pkg.annualPrice) return 0;
  return Math.max(0, Math.round((1 - Number(pkg.annualPrice) / full) * 100));
};

/** Text in the UI language: Arabic marketing text from the admin when there is one, else the translated English. */
export const pkgText = (pkg, field, lang, t) => {
  const ar = pkg?.[`${field}Ar`];
  if (lang === 'ar' && ar && (!Array.isArray(ar) || ar.length)) return ar;
  const en = pkg?.[field];
  return Array.isArray(en) ? en.map((x) => t(x)) : t(en || '');
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
