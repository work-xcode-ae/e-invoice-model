// Advertising spaces (WEB-06): ad packages, upload and approval, scheduling, a tax invoice for the
// advertiser, views and clicks report, and a global stop switch.
import { read, write, fail, delay } from './api';
import { getPlatform } from './platform';
import { issueInvoice } from './modelDocs';
import { createTask, completeTasksFor } from './tasks';
import { createLead } from './crm';
import { addAudit } from './audit';

const KEY = 'mei_ads';
const iso = (d = new Date()) => new Date(d).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const DEMO = [
  { id: 'AD-101', advertiser: 'Gulf Accounting Software', contact: 'Sami Aziz', email: 'ads@gulfacc.ae', trn: '100555666700003', packageId: 'ad-month', placement: 'Home banner', title: 'Connect your ERP in one day', titleAr: 'اربط نظامك المحاسبي في يوم واحد', image: '', link: 'https://example.com', start: '2026-11-01', end: '2026-11-30', status: 'Approved', views: 1840, clicks: 62, invoiceId: null, createdAt: '2026-10-28T10:00:00.000Z' },
  { id: 'AD-102', advertiser: 'Emirates Audit Partners', contact: 'Lara Nassar', email: 'marketing@eap.ae', trn: '', packageId: 'ad-news', placement: 'News sidebar', title: 'Year-end VAT review — book now', titleAr: 'مراجعة ضريبة نهاية العام — احجز الآن', image: '', link: 'https://example.com', start: '2026-11-20', end: '2026-12-20', status: 'Pending', views: 0, clicks: 0, invoiceId: null, createdAt: '2026-11-14T08:00:00.000Z' },
];

export const getAds = () => read(KEY, DEMO);
const saveAds = (list) => write(KEY, list);
const patchAd = (id, fn) => { const list = getAds(); saveAds(list.map((a) => (a.id === id ? fn(a) : a))); return getAds().find((a) => a.id === id); };

export async function submitAd(form) {
  await delay(500);
  const pk = getPlatform().ads.packages.find((p) => p.id === form.packageId);
  if (!form.advertiser || !/^\S+@\S+\.\S+$/.test(form.email || '') || !pk) throw fail('Fill in the advertiser, a valid email and the ad package.');
  if (!form.start) throw fail('Choose a start date.');
  const end = new Date(form.start); end.setDate(end.getDate() + pk.days - 1);
  const ad = { id: `AD-${String(getAds().length + 101)}`, ...form, placement: pk.placement, end: end.toISOString().slice(0, 10), status: 'Pending', views: 0, clicks: 0, invoiceId: null, createdAt: iso() };
  saveAds([ad, ...getAds()]);
  createTask({ type: 'ad-approval', ref: { kind: 'ad', id: ad.id, name: `${ad.id} · ${ad.advertiser}` } });
  createLead({ name: form.contact || form.advertiser, company: form.advertiser, email: form.email, phone: form.phone, source: 'Advertisement', note: `Ad request ${ad.id}` });
  return ad;
}

/** Approve: the advertiser gets a tax invoice (same series) and the ad goes live on its dates. */
export function approveAd(id) {
  const ad = getAds().find((a) => a.id === id);
  const pk = getPlatform().ads.packages.find((p) => p.id === ad.packageId);
  const inv = issueInvoice({ party: { name: ad.advertiser, legalName: ad.advertiser, trn: ad.trn || '', address: '', email: ad.email, peppolId: '' }, kind: 'Advertising', lines: [{ desc: { key: 'Advertising · {name} · {from} to {to}', vars: { name: pk?.name || ad.packageId, from: ad.start, to: ad.end } }, amount: Number(pk?.price || 0), kind: 'ad' }], method: 'Bank transfer', status: 'Unpaid' });
  completeTasksFor(id);
  addAudit({ area: 'Website', action: 'Advertisement approved', entity: id, before: { status: ad.status }, after: { status: 'Approved', invoice: inv.id } });
  return patchAd(id, (a) => ({ ...a, status: 'Approved', approvedAt: iso(), invoiceId: inv.id }));
}
export function rejectAd(id, note) {
  if (!note?.trim()) throw fail('Give a reason.');
  completeTasksFor(id);
  return patchAd(id, (a) => ({ ...a, status: 'Rejected', note }));
}
export const stopAd = (id) => patchAd(id, (a) => ({ ...a, status: 'Stopped', stoppedAt: iso() }));

/** Ads to show now in a placement (approved, in their dates, and not globally stopped). */
export function liveAds(placement) {
  if (getPlatform().ads.globalStop || !getPlatform().features.ads) return [];
  const d = today();
  return getAds().filter((a) => a.status === 'Approved' && a.placement === placement && a.start <= d && a.end >= d);
}
export const trackView = (id) => patchAd(id, (a) => ({ ...a, views: (a.views || 0) + 1 }));
export const trackClick = (id) => patchAd(id, (a) => ({ ...a, clicks: (a.clicks || 0) + 1 }));
