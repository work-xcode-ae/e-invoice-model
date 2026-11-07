// Qvalia (White Label / PSP) integration.
//
// Builds the outgoing invoice in UBL, in Qvalia's JSON representation (xml2js style:
// every element is an array, text under "_", attributes under "$", cbc:/cac: prefixes kept —
// see https://api.qvalia.io/sample-data/api-sample-data/invoice) or as UBL XML, and sends it to
//   POST {base}/transaction/{accountRegNo}/invoices/outgoing   (header Idempotency-Key)
//
// The API key must never live in the browser, so "live" mode posts to a small backend proxy
// (see server/qvalia-proxy.mjs) that adds the Authorization header. "simulation" mode returns
// realistic Qvalia responses without calling anything.

import { read, write } from './api';
import { computeTotals } from './invoices';
import { PROFILES, EXEMPTION_REASON } from '../data/ubl';

const KEY = 'mei_qvalia';
export const QVALIA_BASE = { test: 'https://api-test.qvalia.com', production: 'https://api.qvalia.com' };
export const DEFAULT_QVALIA = {
  mode: 'simulation', // 'simulation' | 'proxy'
  environment: 'test', // 'test' | 'production'
  accountRegNo: '',
  proxyUrl: '/api/qvalia',
  profile: 'pint-ae',
  endpointScheme: '0235',
  format: 'json', // 'json' | 'xml'
  deliveryMethod: 'peppol',
};
export const getQvaliaConfig = () => ({ ...DEFAULT_QVALIA, ...read(KEY, {}) });
export const saveQvaliaConfig = (patch) => write(KEY, { ...getQvaliaConfig(), ...patch });

// ---------------------------------------------------------------------------
// Tiny element tree → JSON (Qvalia/xml2js) and XML
// ---------------------------------------------------------------------------
const E = (name, value, attrs) => {
  if (Array.isArray(value)) {
    const children = value.filter(Boolean);
    return children.length ? { name, attrs, children } : null;
  }
  if (value === undefined || value === null || value === '') return null;
  return { name, attrs, text: String(value) };
};

function nodeToJson(node) {
  if (node.children) {
    const o = {};
    if (node.attrs) o.$ = node.attrs;
    node.children.forEach((c) => { (o[c.name] = o[c.name] || []).push(nodeToJson(c)); });
    return o;
  }
  const o = { _: node.text };
  if (node.attrs) o.$ = node.attrs;
  return o;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function nodeToXml(node, depth = 0) {
  const pad = '    '.repeat(depth);
  const attrs = node.attrs ? Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('') : '';
  if (node.children) {
    return `${pad}<${node.name}${attrs}>\n${node.children.map((c) => nodeToXml(c, depth + 1)).join('\n')}\n${pad}</${node.name}>`;
  }
  return `${pad}<${node.name}${attrs}>${esc(node.text)}</${node.name}>`;
}

const NS = {
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
};

const amt = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
const cur = (currency) => ({ currencyID: currency });

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------
function address(a = {}) {
  return E('cac:PostalAddress', [
    E('cbc:StreetName', a.street),
    E('cbc:AdditionalStreetName', a.additionalStreet),
    E('cbc:CityName', a.city),
    E('cbc:PostalZone', a.postalZone),
    E('cbc:CountrySubentity', a.emirate || a.subentity),
    E('cac:Country', [E('cbc:IdentificationCode', a.country || 'AE')]),
  ]);
}

function party(p, scheme) {
  const endpoint = p.peppolId || p.trn;
  return E('cac:Party', [
    E('cbc:EndpointID', endpoint, { schemeID: p.endpointScheme || scheme }),
    p.partyId ? E('cac:PartyIdentification', [E('cbc:ID', p.partyId)]) : null,
    E('cac:PartyName', [E('cbc:Name', p.name)]),
    address(p),
    p.trn ? E('cac:PartyTaxScheme', [E('cbc:CompanyID', p.trn), E('cac:TaxScheme', [E('cbc:ID', 'VAT')])]) : null,
    E('cac:PartyLegalEntity', [
      E('cbc:RegistrationName', p.legalName || p.name),
      E('cbc:CompanyID', p.tradeLicense),
    ]),
    (p.contactName || p.phone || p.email)
      ? E('cac:Contact', [E('cbc:Name', p.contactName), E('cbc:Telephone', p.phone), E('cbc:ElectronicMail', p.email)])
      : null,
  ]);
}

const taxCategory = (tag, cat, rate) => E(tag, [
  E('cbc:ID', cat),
  cat === 'O' ? null : E('cbc:Percent', Number(rate).toFixed(1)),
  ['E', 'O'].includes(cat) ? E('cbc:TaxExemptionReason', EXEMPTION_REASON[cat]) : null,
  E('cac:TaxScheme', [E('cbc:ID', 'VAT')]),
]);

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------
/** Seller & buyer snapshots are stored on the invoice when it is created. */
export function buildInvoiceTree(inv, cfg = getQvaliaConfig()) {
  const profile = PROFILES[cfg.profile] || PROFILES['pint-ae'];
  const currency = inv.currency || 'AED';
  const seller = inv.seller || {};
  const buyer = inv.buyer || {};
  const { lines, groups, subtotal, discount, vat, total } = computeTotals(inv.items, { discountPct: inv.discountPct });

  const root = E('Invoice', [
    E('cbc:CustomizationID', profile.customizationId),
    E('cbc:ProfileID', profile.profileId),
    E('cbc:ID', inv.id),
    E('cbc:IssueDate', inv.issueDate),
    E('cbc:DueDate', inv.dueDate),
    E('cbc:InvoiceTypeCode', '380'),
    E('cbc:Note', inv.notes),
    E('cbc:DocumentCurrencyCode', currency),
    E('cbc:BuyerReference', inv.buyerReference || buyer.buyerReference || buyer.id),
    inv.orderReference ? E('cac:OrderReference', [E('cbc:ID', inv.orderReference)]) : null,
    E('cac:AccountingSupplierParty', [party(seller, cfg.endpointScheme)]),
    E('cac:AccountingCustomerParty', [party(buyer, cfg.endpointScheme)]),
    inv.deliveryDate ? E('cac:Delivery', [E('cbc:ActualDeliveryDate', inv.deliveryDate)]) : null,
    seller.iban
      ? E('cac:PaymentMeans', [
          E('cbc:PaymentMeansCode', '30', { name: 'Credit transfer' }),
          E('cbc:PaymentID', inv.id),
          E('cac:PayeeFinancialAccount', [
            E('cbc:ID', seller.iban),
            E('cbc:Name', seller.bankAccountName || seller.legalName || seller.name),
            seller.bic ? E('cac:FinancialInstitutionBranch', [E('cbc:ID', seller.bic)]) : null,
          ]),
        ])
      : null,
    E('cac:PaymentTerms', [E('cbc:Note', inv.paymentTerms)]),
    ...groups.filter((g) => g.allowance > 0).map((g) => E('cac:AllowanceCharge', [
      E('cbc:ChargeIndicator', 'false'),
      E('cbc:AllowanceChargeReason', 'Discount'),
      E('cbc:MultiplierFactorNumeric', String(inv.discountPct)),
      E('cbc:Amount', amt(g.allowance), cur(currency)),
      E('cbc:BaseAmount', amt(g.net), cur(currency)),
      taxCategory('cac:TaxCategory', g.taxCategory, g.rate),
    ])),
    E('cac:TaxTotal', [
      E('cbc:TaxAmount', amt(vat), cur(currency)),
      ...groups.map((g) => E('cac:TaxSubtotal', [
        E('cbc:TaxableAmount', amt(g.taxable), cur(currency)),
        E('cbc:TaxAmount', amt(g.tax), cur(currency)),
        taxCategory('cac:TaxCategory', g.taxCategory, g.rate),
      ])),
    ]),
    E('cac:LegalMonetaryTotal', [
      E('cbc:LineExtensionAmount', amt(subtotal), cur(currency)),
      E('cbc:TaxExclusiveAmount', amt(subtotal - discount), cur(currency)),
      E('cbc:TaxInclusiveAmount', amt(total), cur(currency)),
      discount > 0 ? E('cbc:AllowanceTotalAmount', amt(discount), cur(currency)) : null,
      E('cbc:PayableAmount', amt(total), cur(currency)),
    ]),
    ...lines.map((l, i) => E('cac:InvoiceLine', [
      E('cbc:ID', String(i + 1)),
      E('cbc:InvoicedQuantity', String(l.qty), { unitCode: l.unitCode || 'C62' }),
      E('cbc:LineExtensionAmount', amt(l.net), cur(currency)),
      E('cac:Item', [
        E('cbc:Description', l.description),
        E('cbc:Name', l.name),
        l.sku ? E('cac:SellersItemIdentification', [E('cbc:ID', l.sku)]) : null,
        l.gtin ? E('cac:StandardItemIdentification', [E('cbc:ID', l.gtin, { schemeID: '0160' })]) : null,
        l.originCountry ? E('cac:OriginCountry', [E('cbc:IdentificationCode', l.originCountry)]) : null,
        l.classificationCode ? E('cac:CommodityClassification', [E('cbc:ItemClassificationCode', l.classificationCode, { listID: l.classificationList || 'SRV' })]) : null,
        taxCategory('cac:ClassifiedTaxCategory', l.taxCategory, l.vatRate),
      ]),
      E('cac:Price', [E('cbc:PriceAmount', amt(l.price), cur(currency))]),
    ])),
  ], NS);
  return root;
}

export const toQvaliaJson = (inv, cfg) => ({ Invoice: nodeToJson(buildInvoiceTree(inv, cfg)) });
export const toUblXml = (inv, cfg) => `<?xml version="1.0" encoding="UTF-8"?>\n${nodeToXml(buildInvoiceTree(inv, cfg))}\n`;

// ---------------------------------------------------------------------------
// Readiness: data Qvalia / Peppol needs before an invoice can be sent
// ---------------------------------------------------------------------------
export function sellerProblems(company) {
  const p = [];
  if (!company) return [{ key: 'Company is not set up. Add your company details first.' }];
  if (!/^\d{15}$/.test(company.trn || '')) p.push({ key: 'Your company TRN (15 digits) is missing.' });
  if (!company.city) p.push({ key: 'Your company city is missing.' });
  if (!company.street) p.push({ key: 'Your company street address is missing.' });
  return p;
}

export function customerProblems(c) {
  const p = [];
  if (!c) return p;
  if (!c.trn && !c.peppolId) p.push('TRN or Peppol ID');
  if (c.trn && !/^\d{15}$/.test(c.trn)) p.push('valid TRN (15 digits)');
  if (!c.city) p.push('city');
  if (!c.country) p.push('country');
  return p;
}

export const itemProblems = (i) => {
  const p = [];
  if (!i.unitCode) p.push('unit');
  if (!i.taxCategory) p.push('VAT category');
  return p;
};

/** Party snapshot stored on the invoice (so the payload can be rebuilt exactly later). */
export const sellerSnapshot = (user) => ({
  name: user.company?.name, legalName: user.company?.legalName || user.company?.name,
  trn: user.company?.trn, tradeLicense: user.company?.tradeLicense, peppolId: user.company?.peppolId,
  street: user.company?.street || user.company?.address, additionalStreet: user.company?.additionalStreet,
  city: user.company?.city, postalZone: user.company?.postalZone, emirate: user.company?.emirate, country: user.company?.country || 'AE',
  contactName: user.fullName, phone: user.company?.phone || user.phone, email: user.company?.email || user.email,
  iban: user.company?.iban, bic: user.company?.bic, bankAccountName: user.company?.bankAccountName,
});
export const buyerSnapshot = (c) => ({
  id: c.id, name: c.name, legalName: c.legalName, trn: c.trn, tradeLicense: c.tradeLicense,
  peppolId: c.peppolId, endpointScheme: c.endpointScheme, buyerReference: c.buyerReference,
  street: c.street || c.address, additionalStreet: c.additionalStreet, city: c.city, postalZone: c.postalZone,
  emirate: c.emirate, country: c.country || 'AE', contactName: c.contactName, phone: c.phone, email: c.email,
});

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export function requestInfo(inv, cfg = getQvaliaConfig()) {
  const acct = cfg.accountRegNo || '{accountRegNo}';
  const url = `${QVALIA_BASE[cfg.environment] || QVALIA_BASE.test}/transaction/${acct}/invoices/outgoing?delivery_method=${cfg.deliveryMethod || 'peppol'}`;
  return {
    method: 'POST',
    url,
    headers: {
      Authorization: cfg.mode === 'proxy' ? '(added by your backend proxy)' : 'Bearer ••••••••',
      'Content-Type': cfg.format === 'xml' ? 'application/xml' : 'application/json',
      'Idempotency-Key': idempotencyKey(inv),
    },
  };
}

/** Qvalia accepts 8–255 chars of [\w.:@+-]. Same key for every retry → safe retries, no duplicates. */
export const idempotencyKey = (inv) => String(inv.idempotencyKey || inv.id).replace(/[^\w.:@+-]/g, '-').padEnd(8, '0').slice(0, 255);

const SIM_ERRORS = [
  { http: 503, type: 'ServiceUnavailable', message: 'Service temporarily unavailable', retry: true },
  { http: 500, type: 'InternalServerError', message: 'Internal server error', retry: true },
  { http: 429, type: 'TooManyRequests', message: 'Rate limit exceeded', retry: true, retryAfter: 30 },
  { http: 0, type: 'Timeout', message: 'No response within 30 seconds', retry: true },
];

/**
 * Sends one invoice. Resolves to:
 *  { ok: true, http, integrationId, message, body }        on 200/201/409 (duplicate = already accepted)
 *  { ok: false, http, retry: boolean, error, body }       on failure
 */
export async function sendInvoice(inv, { successRate = 0.85, cfg = getQvaliaConfig() } = {}) {
  const req = requestInfo(inv, cfg);
  const body = cfg.format === 'xml' ? toUblXml(inv, cfg) : JSON.stringify(toQvaliaJson(inv, cfg));

  if (cfg.mode !== 'proxy') {
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    if (Math.random() < successRate) {
      const integrationId = `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 14)}`;
      const resBody = { status: 'success', data: { message: `Invoice ${inv.id} sent`, integrationId, invoice_id: inv.id } };
      return { ok: true, http: 200, integrationId, message: resBody.data.message, body: resBody, request: req };
    }
    const e = SIM_ERRORS[Math.floor(Math.random() * SIM_ERRORS.length)];
    const resBody = e.http ? { status: 'error', type: e.type, data: { message: e.message }, metadata: e.retryAfter ? { retryAfter: e.retryAfter } : {} } : null;
    return { ok: false, http: e.http, retry: e.retry, error: e.http ? `${e.http} ${e.type}` : e.message, body: resBody, request: req };
  }

  // Live: through the backend proxy (keeps the API key on the server).
  const path = `/transaction/${encodeURIComponent(cfg.accountRegNo)}/invoices/outgoing?delivery_method=${cfg.deliveryMethod || 'peppol'}&env=${cfg.environment}`;
  try {
    const res = await fetch(`${cfg.proxyUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': req.headers['Content-Type'], 'Idempotency-Key': req.headers['Idempotency-Key'], Accept: 'application/json' },
      body,
    });
    let resBody = null;
    try { resBody = await res.json(); } catch { /* empty / non-JSON */ }
    if (res.ok) {
      const d = resBody?.data || resBody || {};
      return { ok: true, http: res.status, integrationId: d.integrationId || null, message: d.message || `HTTP ${res.status}`, body: resBody, request: req };
    }
    if (res.status === 409) {
      return { ok: true, http: 409, integrationId: resBody?.metadata?.integrationId || null, message: 'Duplicate: already accepted by Qvalia', body: resBody, request: req };
    }
    const retry = res.status === 429 || res.status >= 500;
    const msg = resBody?.data?.message || resBody?.message || res.statusText;
    return { ok: false, http: res.status, retry, error: `${res.status} ${msg}`, body: resBody, request: req };
  } catch (err) {
    return { ok: false, http: 0, retry: true, error: `Network error: ${err.message}`, body: null, request: req };
  }
}
