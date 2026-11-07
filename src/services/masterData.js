// Master data per company: customers (buyer parties), items (products & services), categories.
// Fields follow what a UBL / Peppol invoice needs (see services/qvalia.js).
import { updateUser, fail } from './api';
import { addLog } from './logs';
import { taxRate } from '../data/ubl';

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const PREFIX = { products: 'P', customers: 'C', categories: 'CAT' };

// ----- Normalisers (also upgrade records saved by older versions) -----
export const normalizeCustomer = (c) => ({
  id: c.id, name: c.name || '', legalName: c.legalName || '', trn: c.trn || '', tradeLicense: c.tradeLicense || '',
  peppolId: c.peppolId || '', endpointScheme: c.endpointScheme || '0235',
  street: c.street || c.address || '', additionalStreet: c.additionalStreet || '', city: c.city || (c.emirate || ''),
  postalZone: c.postalZone || '', emirate: c.emirate || '', country: c.country || 'AE',
  contactName: c.contactName || '', email: c.email || '', phone: c.phone || '',
  buyerReference: c.buyerReference || '', paymentDays: c.paymentDays ?? 30, updatedAt: c.updatedAt,
});

export const normalizeItem = (p) => {
  const taxCategory = p.taxCategory || (Number(p.vatRate) === 0 ? 'Z' : 'S');
  return {
    id: p.id, name: p.name || '', description: p.description || '', type: p.type || 'Service', categoryId: p.categoryId || '',
    sku: p.sku || '', gtin: p.gtin || '', unitCode: p.unitCode || (p.type === 'Product' ? 'H87' : 'C62'),
    price: p.price ?? '', taxCategory, vatRate: taxRate(taxCategory),
    classificationList: p.classificationList || '', classificationCode: p.classificationCode || '', originCountry: p.originCountry || '',
    updatedAt: p.updatedAt,
  };
};

export const normalizeCategory = (c) => ({
  id: c.id, name: c.name || '', description: c.description || '',
  defaultUnit: c.defaultUnit || '', defaultTaxCategory: c.defaultTaxCategory || '',
  classificationList: c.classificationList || '', classificationCode: c.classificationCode || '',
});

const NORMALIZE = { customers: normalizeCustomer, products: normalizeItem, categories: normalizeCategory };
export const list = (user, collection) => (user?.[collection] || []).map(NORMALIZE[collection]);

// ----- Validation -----
export function validateRecord(collection, r) {
  if (!r.name || !String(r.name).trim()) throw fail('Name is required.');
  if (collection === 'customers') {
    if (r.trn && !/^\d{15}$/.test(r.trn)) throw fail('TRN must be 15 digits.');
    if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) throw fail('Enter a valid email.');
    if (!r.country) throw fail('Country is required.');
  }
  if (collection === 'products') {
    if (r.price === '' || !(Number(r.price) >= 0)) throw fail('Enter a valid price.');
    if (!r.unitCode) throw fail('Choose a unit.');
    if (!r.taxCategory) throw fail('Choose a VAT category.');
  }
}

export function saveRecord(user, collection, record) {
  const rec0 = collection === 'products' ? { ...record, price: Number(record.price), vatRate: taxRate(record.taxCategory) } : { ...record };
  validateRecord(collection, rec0);
  const isNew = !rec0.id;
  const rec = { ...rec0, id: rec0.id || uid(PREFIX[collection]), updatedAt: new Date().toISOString() };
  updateUser(user.id, (u) => {
    const items = u[collection] || [];
    return { [collection]: isNew ? [rec, ...items] : items.map((x) => (x.id === rec.id ? rec : x)) };
  });
  addLog({ type: 'activity', userId: user.id, company: user.company?.name, action: isNew ? 'Master data created' : 'Master data updated', details: rec.name });
  return rec;
}

export function deleteRecord(user, collection, id) {
  if (collection === 'categories' && (user.products || []).some((p) => p.categoryId === id)) {
    throw fail('This category is used by products. Move them to another category first.');
  }
  return updateUser(user.id, (u) => ({ [collection]: (u[collection] || []).filter((x) => x.id !== id) }));
}

// ----- Sample data -----
export const SAMPLE_MASTER_DATA = {
  categories: [
    { id: 'CAT-SRV', name: 'Professional services', description: 'Consulting, audit and advisory', defaultUnit: 'HUR', defaultTaxCategory: 'S', classificationList: 'STI', classificationCode: '79200000' },
    { id: 'CAT-SW', name: 'Software', description: 'Licences and subscriptions', defaultUnit: 'ANN', defaultTaxCategory: 'S', classificationList: 'STI', classificationCode: '48000000' },
    { id: 'CAT-HW', name: 'Hardware', description: 'Computers and equipment', defaultUnit: 'H87', defaultTaxCategory: 'S', classificationList: 'HS', classificationCode: '847130' },
    { id: 'CAT-EXP', name: 'Export services', description: 'Services supplied outside the UAE', defaultUnit: 'C62', defaultTaxCategory: 'Z', classificationList: '', classificationCode: '' },
  ],
  products: [
    { id: 'P-CONS', name: 'Consulting service', description: 'Advisory, per hour', type: 'Service', categoryId: 'CAT-SRV', price: 450, taxCategory: 'S', vatRate: 5, sku: 'SRV-001', unitCode: 'HUR', classificationList: 'STI', classificationCode: '79411000' },
    { id: 'P-AUD', name: 'Annual audit', description: 'Statutory audit of financial statements', type: 'Service', categoryId: 'CAT-SRV', price: 12000, taxCategory: 'S', vatRate: 5, sku: 'SRV-002', unitCode: 'C62', classificationList: 'STI', classificationCode: '79212000' },
    { id: 'P-LIC', name: 'Software licence (annual)', description: 'Accounting software, 1 seat', type: 'Product', categoryId: 'CAT-SW', price: 800, taxCategory: 'S', vatRate: 5, sku: 'SW-010', unitCode: 'ANN', classificationList: 'STI', classificationCode: '48443000' },
    { id: 'P-LAP', name: 'Business laptop', description: '14" laptop, 16 GB RAM', type: 'Product', categoryId: 'CAT-HW', price: 4200, taxCategory: 'S', vatRate: 5, sku: 'HW-100', gtin: '06291041500213', unitCode: 'H87', classificationList: 'HS', classificationCode: '847130', originCountry: 'CN' },
    { id: 'P-EXP', name: 'Export shipment handling', description: 'Logistics for goods exported outside the GCC', type: 'Service', categoryId: 'CAT-EXP', price: 1500, taxCategory: 'Z', vatRate: 0, sku: 'SRV-090', unitCode: 'C62' },
  ],
  customers: [
    { id: 'C-NOOR', name: 'Al Noor LLC', legalName: 'Al Noor Trading L.L.C', trn: '100345678900003', tradeLicense: 'CN-2045511', peppolId: '100345678900003', endpointScheme: '0235',
      street: 'Al Rigga Street, Office 302', city: 'Dubai', postalZone: 'P.O. Box 12345', emirate: 'Dubai', country: 'AE',
      contactName: 'Mariam Al Noor', email: 'accounts@alnoor.ae', phone: '+971 4 123 4567', buyerReference: 'AN-PO', paymentDays: 30 },
    { id: 'C-GULF', name: 'Gulf Star Trading', legalName: 'Gulf Star General Trading L.L.C', trn: '100456789000003', tradeLicense: 'SH-778812', peppolId: '100456789000003', endpointScheme: '0235',
      street: 'Al Majaz 2, Building 14', city: 'Sharjah', postalZone: 'P.O. Box 6611', emirate: 'Sharjah', country: 'AE',
      contactName: 'Imran Sheikh', email: 'finance@gulfstar.ae', phone: '+971 6 234 5678', buyerReference: '', paymentDays: 45 },
    { id: 'C-OASIS', name: 'Oasis Medical Center', legalName: 'Oasis Medical Center L.L.C', trn: '100567890100003', tradeLicense: 'AD-339201', peppolId: '100567890100003', endpointScheme: '0235',
      street: 'Khalifa City A, Street 21', city: 'Abu Dhabi', postalZone: 'P.O. Box 4420', emirate: 'Abu Dhabi', country: 'AE',
      contactName: 'Dr. Salma Hassan', email: 'billing@oasismc.ae', phone: '+971 2 345 6789', buyerReference: 'OMC-FIN', paymentDays: 30 },
    { id: 'C-PALM', name: 'Palm Tech Solutions', legalName: 'Palm Tech Solutions FZ-LLC', trn: '100678901200003', tradeLicense: 'DIC-90112', peppolId: '100678901200003', endpointScheme: '0235',
      street: 'Dubai Internet City, Building 5', city: 'Dubai', postalZone: 'P.O. Box 500201', emirate: 'Dubai', country: 'AE',
      contactName: 'Arjun Rao', email: 'ap@palmtech.ae', phone: '+971 4 456 7890', buyerReference: '', paymentDays: 15 },
  ],
};

export const SAMPLE_COMPANY_EXTRAS = {
  legalName: 'ABC Trading L.L.C', street: 'Office 1204, Bay Square, Building 3', city: 'Dubai', postalZone: 'P.O. Box 98765',
  country: 'AE', peppolId: '', iban: 'AE070331234567890123456', bic: 'EBILAEAD', bankAccountName: 'ABC Trading L.L.C',
};

export const loadSampleMasterData = (user) =>
  updateUser(user.id, (u) => {
    const merge = (key) => [...SAMPLE_MASTER_DATA[key], ...(u[key] || []).filter((c) => !SAMPLE_MASTER_DATA[key].some((s) => s.id === c.id))];
    return { categories: merge('categories'), products: merge('products'), customers: merge('customers') };
  });
