// Excel import / export for customers, items and categories.
// One row per record. Existing records are matched (customers by TRN, then name; items by SKU, then name;
// categories by name) and updated; the rest are added. Invalid rows are skipped and reported.
import { updateUser } from './api';
import { addLog } from './logs';
import { notify } from './notifications';
import { list, validateRecord } from './masterData';
import { UNIT_CODES, TAX_CATEGORIES, taxRate, COUNTRIES, EMIRATES, CLASSIFICATION_LISTS } from '../data/ubl';

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const low = (v) => str(v).toLowerCase();

/** Column = [header, field, required, help, example]. Headers are what users see in Excel. */
export const COLUMNS = {
  customers: [
    ['Name', 'name', true, 'Trading name shown in the app.', 'Al Noor LLC'],
    ['LegalName', 'legalName', false, 'As on the trade licence.', 'Al Noor Trading L.L.C'],
    ['TRN', 'trn', false, '15 digits. Used to match existing customers.', '100345678900003'],
    ['TradeLicense', 'tradeLicense', false, '', 'CN-2045511'],
    ['PeppolID', 'peppolId', false, 'Leave empty to use the TRN.', ''],
    ['Street', 'street', false, 'Needed for e-invoicing.', 'Al Rigga Street, Office 302'],
    ['AdditionalStreet', 'additionalStreet', false, '', ''],
    ['City', 'city', false, 'Needed for e-invoicing.', 'Dubai'],
    ['POBox', 'postalZone', false, '', 'P.O. Box 12345'],
    ['Emirate', 'emirate', false, 'Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah.', 'Dubai'],
    ['Country', 'country', false, '2-letter code. Default AE.', 'AE'],
    ['ContactName', 'contactName', false, '', 'Mariam Al Noor'],
    ['Email', 'email', false, '', 'accounts@alnoor.ae'],
    ['Phone', 'phone', false, '', '+971 4 123 4567'],
    ['BuyerReference', 'buyerReference', false, 'Reference quoted on invoices.', 'AN-PO'],
    ['PaymentDays', 'paymentDays', false, 'Payment terms in days. Default 30.', 30],
  ],
  products: [
    ['Name', 'name', true, '', 'Consulting service'],
    ['SKU', 'sku', false, 'Your item code. Used to match existing items.', 'SRV-001'],
    ['Description', 'description', false, '', 'Advisory, per hour'],
    ['Type', 'type', false, 'Service or Product. Default Service.', 'Service'],
    ['Category', 'category', false, 'Category name. Created if it does not exist.', 'Professional services'],
    ['UnitPrice', 'price', true, 'Price in AED, without VAT.', 450],
    ['Unit', 'unitCode', false, 'Code (C62, H87, HUR, DAY, MON, ANN, KGM…) or name. Defaults from the category.', 'HUR'],
    ['VATCategory', 'taxCategory', false, 'S (standard rate), Z (0%), E (exempt), O (out of scope). Defaults from the category.', 'S'],
    ['GTIN', 'gtin', false, 'Barcode.', ''],
    ['OriginCountry', 'originCountry', false, '2-letter code.', ''],
    ['ClassificationScheme', 'classificationList', false, 'SRV, STI, TST or HS.', ''],
    ['ClassificationCode', 'classificationCode', false, '', ''],
  ],
  categories: [
    ['Name', 'name', true, 'Used to match existing categories.', 'Professional services'],
    ['Description', 'description', false, '', 'Consulting, audit and advisory'],
    ['DefaultUnit', 'defaultUnit', false, 'Unit code or name.', 'HUR'],
    ['DefaultVATCategory', 'defaultTaxCategory', false, 'S, Z, E or O.', 'S'],
    ['ClassificationScheme', 'classificationList', false, 'SRV, STI, TST or HS.', 'STI'],
    ['ClassificationCode', 'classificationCode', false, '', '79200000'],
  ],
};

export const SHEET_NAME = { customers: 'Customers', products: 'Items', categories: 'Categories' };
const PREFIX = { products: 'P', customers: 'C', categories: 'CAT' };

// ----- Value parsers (accept codes, names and common spellings) -----
const unitCode = (v) => {
  const s = low(v); if (!s) return '';
  const u = UNIT_CODES.find((x) => x.code.toLowerCase() === s || x.label.toLowerCase() === s || x.label.toLowerCase().startsWith(s));
  return u ? u.code : null;
};
const taxCat = (v) => {
  const s = low(v).replace('%', ''); if (!s) return '';
  if (['s', 'standard', String(taxRate('S')), String(taxRate('S') / 100)].includes(s)) return 'S';
  if (['z', '0', 'zero', 'zero rated'].includes(s)) return 'Z';
  if (['e', 'exempt'].includes(s)) return 'E';
  if (['o', 'out of scope'].includes(s)) return 'O';
  return TAX_CATEGORIES.find((x) => x.label.toLowerCase() === s)?.code || null;
};
const country = (v) => {
  const s = low(v); if (!s) return '';
  const c = COUNTRIES.find((x) => x.code.toLowerCase() === s || x.label.toLowerCase() === s);
  return c ? c.code : (/^[a-z]{2}$/.test(s) ? s.toUpperCase() : null);
};
const emirate = (v) => { const s = low(v); return s ? (EMIRATES.find((e) => e.toLowerCase() === s) || str(v)) : ''; };
const scheme = (v) => { const s = str(v).toUpperCase(); return !s ? '' : CLASSIFICATION_LISTS.some((c) => c.code === s) ? s : null; };

/** Header lookup that ignores case, spaces and punctuation ("Unit price" = "UnitPrice"). */
const keyOf = (h) => low(h).replace(/[^a-z0-9]/g, '');
function rowGetter(row) {
  const map = {};
  Object.keys(row).forEach((h) => { map[keyOf(h)] = row[h]; });
  return (header) => map[keyOf(header)];
}

/**
 * Turn sheet rows into import lines.
 * Returns [{ row, record, action: 'add'|'update'|'skip', errors: [{key, vars}], newCategory? }]
 */
export function parseRows(user, collection, rows) {
  const existing = list(user, collection);
  const cats = list(user, 'categories');
  const seen = new Map();
  const newCats = new Map();

  return rows.map((raw, i) => {
    const get = rowGetter(raw);
    const rowNo = i + 2;
    const errors = [];
    const r = {};
    COLUMNS[collection].forEach(([header, field]) => { r[field] = get(header); });
    Object.keys(r).forEach((k) => { if (typeof r[k] === 'string') r[k] = r[k].trim(); });
    const blank = Object.values(r).every((v) => str(v) === '');
    if (blank) return null;

    let rec;
    if (collection === 'customers') {
      const c = country(r.country);
      if (c === null) errors.push({ key: 'Unknown country "{v}". Use a 2-letter code like AE.', vars: { v: r.country } });
      rec = {
        name: str(r.name), legalName: str(r.legalName), trn: str(r.trn).replace(/\s/g, ''), tradeLicense: str(r.tradeLicense),
        peppolId: str(r.peppolId), endpointScheme: '0235', street: str(r.street), additionalStreet: str(r.additionalStreet),
        city: str(r.city), postalZone: str(r.postalZone), emirate: emirate(r.emirate), country: c || 'AE',
        contactName: str(r.contactName), email: str(r.email), phone: str(r.phone), buyerReference: str(r.buyerReference),
        paymentDays: str(r.paymentDays) === '' ? 30 : Number(r.paymentDays),
      };
      if (!(rec.paymentDays >= 0)) errors.push({ key: 'Payment days must be a number.' });
    } else if (collection === 'products') {
      // Category: existing, created earlier in this file, or new.
      let cat = null;
      const cn = str(r.category);
      if (cn) {
        cat = cats.find((x) => low(x.name) === low(cn)) || newCats.get(low(cn));
        if (!cat) { cat = { id: uid('CAT'), name: cn, isNew: true }; newCats.set(low(cn), cat); }
      }
      const u = unitCode(r.unitCode); const tc = taxCat(r.taxCategory);
      if (u === null) errors.push({ key: 'Unknown unit "{v}".', vars: { v: r.unitCode } });
      if (tc === null) errors.push({ key: 'Unknown VAT category "{v}". Use S, Z, E or O.', vars: { v: r.taxCategory } });
      const type = /^p/i.test(str(r.type)) ? 'Product' : 'Service';
      const unit = u || cat?.defaultUnit || (type === 'Product' ? 'H87' : 'C62');
      const taxCategory = tc || cat?.defaultTaxCategory || 'S';
      const price = typeof r.price === 'number' ? r.price : Number(str(r.price).replace(/[^\d.-]/g, ''));
      const sch = scheme(r.classificationList);
      if (sch === null) errors.push({ key: 'Unknown classification scheme "{v}".', vars: { v: r.classificationList } });
      const oc = country(r.originCountry);
      rec = {
        name: str(r.name), sku: str(r.sku), description: str(r.description), type, categoryId: cat?.id || '',
        price: str(r.price) === '' ? '' : price, unitCode: unit, taxCategory, vatRate: taxRate(taxCategory),
        gtin: str(r.gtin), originCountry: oc || '', classificationList: sch || cat?.classificationList || '',
        classificationCode: str(r.classificationCode) || cat?.classificationCode || '',
      };
      if (cat?.isNew) rec._newCategory = cat;
    } else {
      const u = unitCode(r.defaultUnit); const tc = taxCat(r.defaultTaxCategory); const sch = scheme(r.classificationList);
      if (u === null) errors.push({ key: 'Unknown unit "{v}".', vars: { v: r.defaultUnit } });
      if (tc === null) errors.push({ key: 'Unknown VAT category "{v}". Use S, Z, E or O.', vars: { v: r.defaultTaxCategory } });
      if (sch === null) errors.push({ key: 'Unknown classification scheme "{v}".', vars: { v: r.classificationList } });
      rec = { name: str(r.name), description: str(r.description), defaultUnit: u || '', defaultTaxCategory: tc || '', classificationList: sch || '', classificationCode: str(r.classificationCode) };
    }

    if (!errors.length) {
      try { validateRecord(collection, rec); } catch (e) { errors.push({ key: e.key || e.message, vars: e.vars }); }
    }

    // Match an existing record and catch duplicates inside the file.
    const matchKey = collection === 'customers' ? (rec.trn ? `trn:${rec.trn}` : `name:${low(rec.name)}`)
      : collection === 'products' ? (rec.sku ? `sku:${low(rec.sku)}` : `name:${low(rec.name)}`) : `name:${low(rec.name)}`;
    if (rec.name && seen.has(matchKey)) errors.push({ key: 'Duplicate of row {row} in this file.', vars: { row: seen.get(matchKey) } });
    else seen.set(matchKey, rowNo);

    const match = existing.find((x) => (collection === 'customers' ? (rec.trn ? x.trn === rec.trn : low(x.name) === low(rec.name))
      : collection === 'products' ? (rec.sku ? low(x.sku) === low(rec.sku) : low(x.name) === low(rec.name))
        : low(x.name) === low(rec.name)));
    if (match) rec.id = match.id;

    return { row: rowNo, record: rec, action: errors.length ? 'skip' : match ? 'update' : 'add', errors, matchName: match?.name };
  }).filter(Boolean);
}

/** Save the valid lines in one write. Returns { added, updated, skipped, categoriesAdded }. */
export function importLines(user, collection, lines) {
  const ok = lines.filter((l) => l.action !== 'skip');
  const at = new Date().toISOString();
  const newCats = new Map();
  ok.forEach((l) => { if (l.record._newCategory) newCats.set(l.record._newCategory.id, l.record._newCategory); });
  updateUser(user.id, (u) => {
    const items = [...(u[collection] || [])];
    ok.forEach((l) => {
      const { _newCategory, ...rec } = l.record; // eslint-disable-line no-unused-vars
      if (rec.id) {
        const i = items.findIndex((x) => x.id === rec.id);
        if (i >= 0) items[i] = { ...items[i], ...rec, updatedAt: at };
      } else items.unshift({ ...rec, id: uid(PREFIX[collection]), updatedAt: at });
    });
    const patch = { [collection]: items };
    if (newCats.size) {
      patch.categories = [...[...newCats.values()].map((c) => ({ id: c.id, name: c.name, description: '', defaultUnit: '', defaultTaxCategory: '', updatedAt: at })), ...(u.categories || [])];
    }
    return patch;
  });
  const res = {
    added: ok.filter((l) => l.action === 'add').length,
    updated: ok.filter((l) => l.action === 'update').length,
    skipped: lines.length - ok.length,
    categoriesAdded: newCats.size,
  };
  addLog({ type: 'activity', userId: user.id, company: user.company?.name, action: 'Excel import', details: '{what}: {added} added, {updated} updated, {skipped} skipped', vars: { what: SHEET_NAME[collection], ...res } });
  notify(user.id, { level: res.skipped ? 'warning' : 'success', key: 'Excel import ({what}): {added} added, {updated} updated, {skipped} skipped.', vars: { what: SHEET_NAME[collection], ...res }, link: collection === 'customers' ? 'customers' : 'items' });
  return res;
}

const exportValue = (collection, field, rec, cats) => {
  if (collection === 'products' && field === 'category') return cats.find((c) => c.id === rec.categoryId)?.name || '';
  return rec[field] ?? '';
};

/** Build a workbook: data sheet (sample rows or the current list) + Help sheet. */
export async function downloadWorkbook(user, collection, { withData = false } = {}) {
  const XLSX = await import('xlsx');
  const cols = COLUMNS[collection];
  const cats = list(user, 'categories');
  const body = withData
    ? list(user, collection).map((r) => cols.map(([, f]) => exportValue(collection, f, r, cats)))
    : [cols.map((c) => c[4])];
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c[0]), ...body]);
  ws['!cols'] = cols.map(([h]) => ({ wch: Math.max(12, h.length + 4) }));
  const help = XLSX.utils.aoa_to_sheet([
    ['Column', 'Required', 'Notes'],
    ...cols.map(([h, , req, note]) => [h, req ? 'yes' : '', note]),
    [],
    ['', '', 'One row per record. Existing records are updated (matched by ' + (collection === 'customers' ? 'TRN, then name' : collection === 'products' ? 'SKU, then name' : 'name') + '); others are added.'],
  ]);
  help['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME[collection]);
  XLSX.utils.book_append_sheet(wb, help, 'Help');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, withData ? `MEI-${SHEET_NAME[collection].toLowerCase()}-${stamp}.xlsx` : `MEI-${SHEET_NAME[collection].toLowerCase()}-template.xlsx`);
}

/** Read the first sheet of an uploaded file into row objects. */
export async function readSheet(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}
