// Settings centre (SET-01): every value the BRD says "is set from the settings" lives here.
// Changes to prices, terms, tax data and durations can be scheduled with an effective date (SET-02).
// Demo: stored in localStorage. Backend: GET/PUT /api/admin/settings/{group}.
import { read, write } from './api';
import { addAudit } from './audit';
import { PACKAGES_KEY, applyPackageOverrides } from '../data/packages';

const KEY = 'mei_platform';
const SCHED_KEY = 'mei_scheduled_changes';

const today = () => new Date().toISOString().slice(0, 10);

const POLICY_TEXT = (name) => ({
  en: `${name}\n\nThis is the version 1.0 placeholder. Model Financial Consulting will provide the approved text, which the manager pastes here from Admin → Website content → Policies.\n\n1. Scope\nThese terms apply to the Model E-Invoice platform operated by Model Financial Consulting L.L.C (CN-2249768).\n\n2. Subscription\nThe subscription year starts on the activation date. Prices exclude VAT unless stated.\n\n3. Documents and data\nDocuments are kept for the statutory retention period for every customer, whatever the package.\n\n4. Changes\nA new version is shown to every user at their next sign-in and must be accepted to continue.`,
  ar: `${name}\n\nهذا نص مؤقت للإصدار 1.0. تقدم موديل للاستشارات المالية النص المعتمد، ويضيفه المدير من لوحة الإدارة ← محتوى الموقع ← السياسات.\n\n1. النطاق\nتسري هذه الشروط على منصة موديل للفوترة الإلكترونية التي تديرها موديل للاستشارات المالية ذ.م.م.\n\n2. الاشتراك\nتبدأ سنة الاشتراك من تاريخ التفعيل. الأسعار لا تشمل ضريبة القيمة المضافة ما لم يُذكر خلاف ذلك.\n\n3. المستندات والبيانات\nتُحفظ المستندات المدة النظامية لكل العملاء أياً كانت الباقة.\n\n4. التعديلات\nيظهر أي إصدار جديد لكل مستخدم عند دخوله التالي ويجب قبوله للمتابعة.`,
});

const policy = (title, titleAr) => ({ title, titleAr, versions: [{ version: '1.0', effectiveDate: '2026-11-15', ...POLICY_TEXT(title) }] });

export const DEFAULTS = {
  features: {
    customerInvoicing: false, // CUS-07: no invoice creation in phase 1 (customers invoice in the billing portal)
    whatsappButton: true,
    newsTicker: true,
    ads: true,
    video: true,
    cookieBanner: true,
    partnerProgram: true,
    customer2fa: true, // available to customers (mandatory for staff and partners)
  },
  channels: { inApp: true, email: true, whatsapp: true }, // NTF-01: no SMS
  durations: {
    freeDocs: 100, graceDays: 7, refundDays: 14, refundPayoutBusinessDays: 7, referralDays: 90,
    commissionHoldDays: 14, archiveDays: 90, csFirstContactHours: 4, leadFirstContactDays: 1,
    usageSyncMinutes: 60, renewalReminderDays: 7,
  },
  workHours: { start: 9, end: 18, days: [1, 2, 3, 4, 5] }, // UAE: Monday–Friday
  registration: {
    blockFreeEmail: true,
    freeEmailDomains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com'],
    activities: ['Trading', 'Services', 'Manufacturing', 'Construction & contracting', 'Healthcare', 'Hospitality & F&B', 'Logistics', 'Real estate', 'Technology', 'Education', 'Other'],
    emirates: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
    licenceIssuers: ['Abu Dhabi DED', 'Dubai DET', 'Sharjah SEDD', 'Ajman DED', 'RAK DED', 'Fujairah DED', 'UAQ DED', 'ADGM', 'DIFC', 'DMCC', 'JAFZA', 'Other free zone'],
    sendingMethods: ['Billing portal (web)', 'Excel upload', 'ERP API', 'Not sure yet'],
    volumes: [{ id: 'v1', label: 'Up to 100 a year', monthly: 8 }, { id: 'v2', label: 'Up to 50 a month', monthly: 50 }, { id: 'v3', label: '50–200 a month', monthly: 200 }, { id: 'v4', label: '200–500 a month', monthly: 500 }, { id: 'v5', label: 'More than 500 a month', monthly: 2000 }],
    requiredDocs: [
      { id: 'licence', label: 'Trade licence', required: true },
      { id: 'eid', label: 'Emirates ID of the authorised person', required: true },
      { id: 'vat', label: 'VAT registration certificate', required: false, note: 'If registered for VAT' },
      { id: 'auth', label: 'Authorisation letter', required: true },
    ],
  },
  consulting: [
    { id: 'cs-vat', name: 'VAT health check', hours: 2, price: 1200 },
    { id: 'cs-einv', name: 'E-invoicing readiness review', hours: 1, price: 600 },
    { id: 'cs-erp', name: 'ERP mapping workshop', hours: 3, price: 1800 },
    { id: 'cs-train', name: 'Team training session', hours: 2, price: 900 },
  ],
  lossReasons: ['Price', 'Chose another provider', 'Not obligated yet', 'No response', 'Timing', 'Other'],
  partnerTypes: ['Referral', 'Sales agent', 'Implementation'],
  commissionTemplates: [
    { id: 'tpl-ref', name: 'Referral', newRate: 10, renewalRate: 5, upgradeRate: 5, includeSetup: false, includeOverage: false, holdDays: 14, cycle: 'Monthly', minPayout: 200, months: 12 },
    { id: 'tpl-agent', name: 'Sales agent', newRate: 20, renewalRate: 10, upgradeRate: 10, includeSetup: true, includeOverage: false, holdDays: 14, cycle: 'Monthly', minPayout: 200, months: 0 },
    { id: 'tpl-impl', name: 'Implementation', newRate: 15, renewalRate: 10, upgradeRate: 10, includeSetup: true, includeOverage: true, holdDays: 14, cycle: 'Quarterly', minPayout: 500, months: 0 },
  ],
  modelTax: {
    legalName: 'Model Financial Consulting L.L.C', legalNameAr: 'موديل للاستشارات المالية ذ.م.م', licence: 'CN-2249768',
    trn: '104123456700003', address: 'Al Wahda Commercial Tower, Office 1504, Abu Dhabi, UAE', addressAr: 'برج الوحدة التجاري، مكتب 1504، أبوظبي، الإمارات',
    peppolId: '0235:1041234567', invoicePrefix: 'INV', creditPrefix: 'CN', email: 'billing@modelfc.ae',
  },
  bank: { bankName: 'Abu Dhabi Commercial Bank', accountName: 'Model Financial Consulting L.L.C', iban: 'AE070331234567890123456', swift: 'ADCBAEAA' },
  sso: { portalUrl: 'https://portal.modelfc.ae' },
  kpiWeights: { tasksDone: 40, slaMet: 40, escalations: 20 },
  // "Are you obligated?" tool (WEB-08). Dates and penalties are editable: Model confirms them before launch.
  obligation: {
    sourceEn: 'Based on Ministerial Decisions No. 243 and 244 of 2025. Model confirms the final dates and amounts before launch.',
    sourceAr: 'استناداً إلى القرارين الوزاريين رقم 243 و244 لسنة 2025. تؤكد موديل التواريخ والمبالغ النهائية قبل الإطلاق.',
    phases: [
      { id: 'large', labelEn: 'Businesses with annual revenue of AED 50 million or more', labelAr: 'الشركات التي تبلغ إيراداتها السنوية 50 مليون درهم أو أكثر', minRevenue: 50000000, appointBy: '2026-07-31', goLive: '2027-01-01' },
      { id: 'other', labelEn: 'Businesses with annual revenue below AED 50 million', labelAr: 'الشركات التي تقل إيراداتها السنوية عن 50 مليون درهم', minRevenue: 0, appointBy: '2027-03-31', goLive: '2027-07-01' },
      { id: 'gov', labelEn: 'Government entities', labelAr: 'الجهات الحكومية', minRevenue: null, appointBy: '2027-03-31', goLive: '2027-10-01' },
    ],
    penalties: [
      { en: 'Not implementing the e-invoicing system on time', ar: 'عدم تطبيق نظام الفوترة الإلكترونية في الموعد', amount: 'AED 5,000 per month' },
      { en: 'Each invoice not issued or sent electronically', ar: 'كل فاتورة لا تصدر أو ترسل إلكترونياً', amount: 'AED 100 per invoice (up to AED 5,000 per month)' },
      { en: 'Each credit note not issued or sent electronically', ar: 'كل إشعار دائن لا يصدر أو يرسل إلكترونياً', amount: 'AED 100 per note (up to AED 5,000 per month)' },
      { en: 'Not telling the FTA about a system failure in time', ar: 'عدم إبلاغ الهيئة عن عطل النظام في الوقت المحدد', amount: 'AED 1,000 per day' },
    ],
  },
  content: {
    pages: {
      home: { titleEn: 'UAE e-invoicing, compliant from day one.', titleAr: '', subtitleEn: 'Subscribe, link with EmaraTax and send compliant e-invoices through Model’s accredited platform.', subtitleAr: '', heroImage: '', seoTitleEn: 'Model E-Invoice | UAE e-invoicing platform', seoTitleAr: 'موديل للفوترة الإلكترونية | منصة الفوترة الإلكترونية في الإمارات', seoDescEn: 'Accredited UAE e-invoicing: Peppol PINT AE, FTA reporting, onboarding support.', seoDescAr: 'فوترة إلكترونية معتمدة في الإمارات: PINT AE وإبلاغ الهيئة ودعم التسجيل.' },
      howItWorks: { titleEn: 'How the service works', titleAr: '', subtitleEn: 'From subscription to your first e-invoice in a few clear steps.', subtitleAr: '', heroImage: '', seoTitleEn: 'How it works | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      packages: { titleEn: 'Packages & Pricing', titleAr: '', subtitleEn: '', subtitleAr: '', heroImage: '', seoTitleEn: 'Packages & pricing | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      partner: { titleEn: 'Become a partner', titleAr: '', subtitleEn: 'Refer customers, sell or implement Model E-Invoice and earn a commission.', subtitleAr: '', heroImage: '', seoTitleEn: 'Partner programme | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      faq: { titleEn: 'Frequently asked questions', titleAr: '', subtitleEn: '', subtitleAr: '', heroImage: '', seoTitleEn: 'FAQ | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      news: { titleEn: 'News', titleAr: '', subtitleEn: 'Updates on UAE e-invoicing and our platform.', subtitleAr: '', heroImage: '', seoTitleEn: 'News | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      contact: { titleEn: 'Contact us', titleAr: '', subtitleEn: '', subtitleAr: '', heroImage: '', seoTitleEn: 'Contact | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      check: { titleEn: 'Are you obligated to e-invoice?', titleAr: '', subtitleEn: 'Answer a few questions to see your deadline, the penalties and the package that fits.', subtitleAr: '', heroImage: '', seoTitleEn: 'E-invoicing obligation check | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
      requirements: { titleEn: 'Requirements', titleAr: '', subtitleEn: '', subtitleAr: '', heroImage: '', seoTitleEn: 'Requirements | Model E-Invoice', seoTitleAr: '', seoDescEn: '', seoDescAr: '' },
    },
    stats: [
      { value: '10000', suffix: '+', labelEn: 'Connected companies', labelAr: '', subEn: 'across 40+ countries', subAr: '' },
      { value: '99.5', suffix: '%', labelEn: 'Availability target', labelAr: '', subEn: 'monitored 24/7', subAr: '' },
      { value: '34', suffix: '', labelEn: 'Validation checkpoints', labelAr: '', subEn: 'PINT AE & EN 16931', subAr: '' },
      { value: 'ISO 27001', suffix: '', labelEn: 'Certified security', labelAr: '', subEn: '& ISO 22301 continuity', subAr: '' },
    ],
    accreditedLabelEn: 'Accredited Service Provider',
    accreditedLabelAr: 'مزود خدمة معتمد',
    faqs: [
      { qEn: 'Who needs to issue e-invoices in the UAE?', aEn: 'In-scope UAE businesses must exchange invoices in Peppol PINT AE format through an Accredited Service Provider, which also reports Tax Data to the FTA.', qAr: '', aAr: '' },
      { qEn: 'Where do I issue my invoices?', aEn: 'In the approved billing portal under Model’s identity. Once your account is active, you open it from your dashboard with single sign-on.', qAr: '', aAr: '' },
      { qEn: 'What happens when I go over my monthly documents?', aEn: 'Sending never stops. Extra documents are billed at your package’s per-document price on the next monthly invoice. We alert you at 80% and 100%.', qAr: '', aAr: '' },
      { qEn: 'Do unused documents carry over?', aEn: 'Yes. Unused monthly documents carry over until the end of your subscription year. The 100 free documents are used first and do not carry over to the next year.', qAr: '', aAr: '' },
      { qEn: 'When does my subscription year start?', aEn: 'On the activation date, once your documents are complete, your account is linked through EmaraTax and your Peppol ID is retrieved — not on the payment date.', qAr: '', aAr: '' },
      { qEn: 'Can I get a refund?', aEn: 'A full refund within 14 days of payment if linking is not complete and no document was sent. After linking, the setup fee is not refundable and there is no partial refund on cancellation.', qAr: '', aAr: '' },
      { qEn: 'Can I move to another provider?', aEn: 'Yes, at any time. Unlinking is immediate and is never held back for unpaid amounts. Your archive stays available for 90 days, then on request.', qAr: '', aAr: '' },
    ],
  },
  news: [
    { id: 'nw1', date: '2026-11-10', titleEn: 'UAE e-invoicing: phase 1 timeline confirmed', titleAr: 'الفوترة الإلكترونية في الإمارات: تأكيد الجدول الزمني للمرحلة الأولى', bodyEn: 'The Ministry of Finance confirmed the dates for the first group of businesses. Check whether you are obligated with our free tool.', bodyAr: 'أكدت وزارة المالية مواعيد المجموعة الأولى من الشركات. تحقق إن كنت ملزماً عبر أداتنا المجانية.', image: '', published: true },
    { id: 'nw2', date: '2026-10-28', titleEn: 'Model E-Invoice is now an Accredited Service Provider', titleAr: 'موديل للفوترة الإلكترونية مزود خدمة معتمد', bodyEn: 'We completed accreditation and can now exchange PINT AE invoices and report Tax Data to the FTA for our customers.', bodyAr: 'أكملنا الاعتماد ويمكننا الآن تبادل فواتير PINT AE وإبلاغ الهيئة الاتحادية للضرائب نيابة عن عملائنا.', image: '', published: true },
    { id: 'nw3', date: '2026-10-05', titleEn: 'Webinar: getting ready for e-invoicing', titleAr: 'ندوة: الاستعداد للفوترة الإلكترونية', bodyEn: 'Join our free session on EmaraTax linking, Peppol IDs and what changes for your finance team.', bodyAr: 'انضم إلى جلستنا المجانية حول الربط عبر إمارات تاكس ومعرّفات Peppol وما يتغير لفريقك المالي.', image: '', published: true },
  ],
  ticker: [
    { id: 'tk1', textEn: 'Phase 1 deadline confirmed — check if you are obligated', textAr: 'تأكيد موعد المرحلة الأولى — تحقق إن كنت ملزماً', link: '/check', order: 1, start: '2026-11-01', end: '2027-03-31', visible: true },
    { id: 'tk2', textEn: 'Free webinar every Tuesday at 11:00', textAr: 'ندوة مجانية كل ثلاثاء الساعة 11:00', link: '/news', order: 2, start: '2026-11-01', end: '2026-12-31', visible: true },
  ],
  video: {
    short: { titleEn: 'Customer journey in 60 seconds', titleAr: 'رحلة العميل في 60 ثانية', url: 'https://www.w3schools.com/html/mov_bbb.mp4', poster: '' },
    full: { titleEn: 'Full walkthrough', titleAr: 'شرح كامل', url: 'https://www.w3schools.com/html/movie.mp4', poster: '' },
  },
  ads: {
    globalStop: false,
    placements: ['Home banner', 'News sidebar'],
    packages: [
      { id: 'ad-week', name: 'Home banner · 1 week', placement: 'Home banner', days: 7, price: 1500 },
      { id: 'ad-month', name: 'Home banner · 1 month', placement: 'Home banner', days: 30, price: 4500 },
      { id: 'ad-news', name: 'News sidebar · 1 month', placement: 'News sidebar', days: 30, price: 2000 },
    ],
  },
  policies: {
    terms: policy('Terms and Conditions', 'الشروط والأحكام'),
    disclaimer: policy('Disclaimer', 'إخلاء المسؤولية'),
    privacy: policy('Privacy Policy', 'سياسة الخصوصية'),
    refund: policy('Refund Policy', 'سياسة الاسترداد'),
    partnerAgreement: policy('Partnership Agreement', 'اتفاقية الشراكة'),
  },
  templates: {
    welcome: { name: 'Welcome', en: 'Welcome to Model E-Invoice, {name}. Upload your documents to start activation.', ar: 'مرحباً بك في موديل للفوترة الإلكترونية، {name}. ارفع مستنداتك لبدء التفعيل.' },
    missingDocs: { name: 'Missing documents', en: 'We need one more document to continue: {doc}. {note}', ar: 'نحتاج مستنداً إضافياً للمتابعة: {doc}. {note}' },
    activation: { name: 'Activation', en: 'Your account is active. Your subscription year starts today, {date}.', ar: 'تم تفعيل حسابك. تبدأ سنة اشتراكك اليوم، {date}.' },
    usage80: { name: 'Usage 80%', en: 'You have used 80% of this month’s documents.', ar: 'استخدمت 80% من مستندات هذا الشهر.' },
    usage100: { name: 'Usage 100%', en: 'You have used all of this month’s documents. Sending continues and extra documents are billed at {price} each.', ar: 'استخدمت كل مستندات هذا الشهر. يستمر الإرسال وتُحتسب المستندات الإضافية بسعر {price} للمستند.' },
    renewal: { name: 'Renewal', en: 'Your subscription renews on {date}. Invoice {no} will be charged to your saved card.', ar: 'يتجدد اشتراكك في {date}. ستُحصّل الفاتورة {no} من بطاقتك المحفوظة.' },
    paymentFailed: { name: 'Payment failed', en: 'We could not charge your card. You have {days} days to pay; sending continues meanwhile.', ar: 'تعذر تحصيل المبلغ من بطاقتك. لديك {days} أيام للسداد، ويستمر الإرسال خلالها.' },
    suspension: { name: 'Suspension', en: 'Your account is suspended for non-payment. Pay now to resume immediately.', ar: 'تم إيقاف حسابك لعدم السداد. ادفع الآن للاستئناف فوراً.' },
    licenceExpiry: { name: 'Licence expiry', en: 'Your trade licence expires on {date}. Upload the renewed licence.', ar: 'تنتهي رخصتك التجارية في {date}. يرجى رفع الرخصة المجددة.' },
    cardExpiry: { name: 'Card expiry', en: 'Your saved card expires at the end of {month}. Update it to avoid a failed renewal.', ar: 'تنتهي بطاقتك المحفوظة في نهاية {month}. حدّثها لتجنب فشل التجديد.' },
    refund: { name: 'Refund', en: 'Refund {id} was approved. Credit note {cn} was issued and {amount} returns to your {method} within 7 working days.', ar: 'تمت الموافقة على الاسترداد {id}. صدر الإشعار الدائن {cn} وسيُعاد {amount} إلى {method} خلال 7 أيام عمل.' },
    commission: { name: 'Commission', en: 'Commission statement {id} for {period} is ready: {amount}.', ar: 'كشف العمولة {id} لفترة {period} جاهز: {amount}.' },
  },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (base, over) => {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  Object.keys(over).forEach((k) => { out[k] = merge(base[k], over[k]); });
  return out;
};

/** Current settings: defaults overlaid with the admin's saved values, after applying due scheduled changes. */
export function getPlatform() {
  applyDueChanges();
  return merge(DEFAULTS, read(KEY, {}));
}

const getAt = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setAt = (obj, path, value) => {
  const keys = path.split('.');
  const root = { ...obj };
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else { cur[k] = isObj(cur[k]) ? { ...cur[k] } : {}; cur = cur[k]; }
  });
  return root;
};

/** Save one setting (dot path, e.g. "durations.graceDays") now. Logged with the value before and after. */
export function setPlatform(path, value, { area = 'Settings', silent = false } = {}) {
  const stored = read(KEY, {});
  const before = getAt(merge(DEFAULTS, stored), path);
  write(KEY, setAt(stored, path, value));
  if (!silent) addAudit({ area, action: 'Setting changed', entity: path, before, after: value });
}

export const getSetting = (path) => getAt(getPlatform(), path);

// ---------- Scheduled changes (SET-02) ----------
export const getScheduled = () => read(SCHED_KEY, []);

/** Schedule a change that starts on `effectiveDate` (today or later). Needs a second confirmation in the UI. */
export function scheduleChange({ path, value, effectiveDate, label }) {
  if (!effectiveDate || effectiveDate < today()) throw Object.assign(new Error('The start date must be today or later.'), { key: 'The start date must be today or later.' });
  const list = getScheduled();
  const item = { id: `SC-${Date.now().toString(36)}`, path, label: label || path, value, effectiveDate, status: 'Scheduled', createdAt: new Date().toISOString(), before: getAt(merge(DEFAULTS, read(KEY, {})), path) };
  write(SCHED_KEY, [item, ...list]);
  addAudit({ area: 'Settings', action: 'Change scheduled', entity: path, before: item.before, after: { value, effectiveDate } });
  if (effectiveDate === today()) applyDueChanges();
  return item;
}

export function cancelScheduled(id) {
  const list = getScheduled();
  const item = list.find((x) => x.id === id);
  if (!item || item.status !== 'Scheduled') return;
  write(SCHED_KEY, list.map((x) => (x.id === id ? { ...x, status: 'Cancelled', cancelledAt: new Date().toISOString() } : x)));
  addAudit({ area: 'Settings', action: 'Scheduled change cancelled', entity: item.path, before: item.value, after: null });
}

let applying = false;
/** Applies every scheduled change whose date has come. A change never applies before its date. */
export function applyDueChanges() {
  if (applying) return;
  applying = true;
  try {
    const list = read(SCHED_KEY, []);
    const due = list.filter((x) => x.status === 'Scheduled' && x.effectiveDate <= today());
    if (!due.length) return;
    let stored = read(KEY, {});
    let pk = null;
    due.forEach((x) => {
      if (x.path.startsWith('package:')) { pk = pk || read(PACKAGES_KEY, {}); pk[x.path.slice(8)] = { ...(pk[x.path.slice(8)] || {}), ...x.value }; return; }
      stored = setAt(stored, x.path, x.value);
    });
    write(KEY, stored);
    if (pk) { write(PACKAGES_KEY, pk); applyPackageOverrides(); }
    write(SCHED_KEY, list.map((x) => (due.includes(x) ? { ...x, status: 'Applied', appliedAt: new Date().toISOString() } : x)));
    due.forEach((x) => addAudit({ area: 'Settings', action: 'Scheduled change applied', entity: x.path, before: x.before, after: x.value, actor: { name: 'System' } }));
  } finally {
    applying = false;
  }
}

// ---------- Helpers used across the app ----------
export const feature = (name) => !!getPlatform().features[name];
export const durations = () => getPlatform().durations;

/** Text in the UI language from an object with xxxEn / xxxAr fields (falls back to English → t()). */
export const localized = (obj, field, lang, t = (s) => s) => {
  if (!obj) return '';
  const ar = obj[`${field}Ar`];
  if (lang === 'ar' && ar) return ar;
  const en = obj[`${field}En`] ?? obj[field] ?? '';
  return t(en);
};

/** Latest version of a policy (terms, privacy…) that is already in force. */
export const currentPolicy = (key) => {
  const p = getPlatform().policies[key];
  if (!p) return null;
  const live = p.versions.filter((v) => v.effectiveDate <= today());
  return live[live.length - 1] || p.versions[0];
};
