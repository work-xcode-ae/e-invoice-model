// Code lists used for UBL / Peppol invoices (subset relevant to UAE e-invoicing).

// UN/ECE Recommendation 20 unit codes (InvoicedQuantity@unitCode)
export const UNIT_CODES = [
  { code: 'C62', label: 'Unit (one)' },
  { code: 'H87', label: 'Piece' },
  { code: 'EA', label: 'Each' },
  { code: 'HUR', label: 'Hour' },
  { code: 'DAY', label: 'Day' },
  { code: 'MON', label: 'Month' },
  { code: 'ANN', label: 'Year' },
  { code: 'KGM', label: 'Kilogram' },
  { code: 'MTR', label: 'Metre' },
  { code: 'LTR', label: 'Litre' },
  { code: 'SET', label: 'Set' },
];

// UNCL5305 VAT category codes (ClassifiedTaxCategory / TaxCategory)
export const TAX_CATEGORIES = [
  { code: 'S', rate: 5, label: 'Standard rate ({rate}%)' }, // rate set by the admin (services/tax.js)
  { code: 'Z', rate: 0, label: 'Zero rated (0%)' },
  { code: 'E', rate: 0, label: 'Exempt from VAT' },
  { code: 'O', rate: 0, label: 'Out of scope of VAT' },
];
export const taxRate = (cat) => TAX_CATEGORIES.find((c) => c.code === cat)?.rate ?? 5;
export const EXEMPTION_REASON = { E: 'Exempt from VAT', O: 'Not subject to VAT' };

// Item classification list identifiers (ItemClassificationCode@listID)
export const CLASSIFICATION_LISTS = [
  { code: 'SRV', label: 'GS1 Global Trade Classification / services' },
  { code: 'STI', label: 'CPV (Common Procurement Vocabulary)' },
  { code: 'TST', label: 'UNSPSC' },
  { code: 'HS', label: 'Harmonized System (customs)' },
];

export const COUNTRIES = [
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'OM', label: 'Oman' },
  { code: 'QA', label: 'Qatar' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'BH', label: 'Bahrain' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'SE', label: 'Sweden' },
  { code: 'IN', label: 'India' },
  { code: 'US', label: 'United States' },
];

export const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

// Peppol electronic address schemes (EndpointID@schemeID)
export const ENDPOINT_SCHEMES = [
  { code: '0235', label: 'UAE TIN (Peppol, UAE)' },
  { code: '0088', label: 'GLN' },
  { code: '0007', label: 'Organisation number (SE)' },
  { code: '9930', label: 'VAT number (DE)' },
];

// Invoice profiles (CustomizationID / ProfileID)
export const PROFILES = {
  'pint-ae': {
    label: 'PINT AE (UAE)',
    customizationId: 'urn:peppol:pint:billing-1@ae-1',
    profileId: 'urn:peppol:bis:billing',
  },
  'peppol-bis-3': {
    label: 'Peppol BIS Billing 3.0 (as in Qvalia sample)',
    customizationId: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    profileId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  },
};

export const PAYMENT_MEANS = [
  { code: '30', label: 'Credit transfer' },
  { code: '58', label: 'SEPA / bank transfer' },
  { code: '48', label: 'Bank card' },
  { code: '10', label: 'Cash' },
];
