// Small shared pieces for the BRD v1.1 screens.
import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';
import { STAGES } from '../services/lifecycle';
import { getPlatform, localized } from '../services/platform';
import { fmtDate } from '../utils/format';

export { Modal } from '../pages/dashboard/MasterForms';

/** The 7 customer stages with the current one highlighted (section 2.4). */
export function StageTracker({ stage }) {
  const { t } = useLang();
  const idx = STAGES.indexOf(stage);
  const bad = stage === 'Suspended' || stage === 'Disconnected';
  return (
    <div className="stage-track" aria-label={t('Account stage')}>
      {STAGES.map((s, i) => {
        const done = !bad ? i < idx : i < 4;
        const cur = s === stage;
        return (
          <div key={s} className={`sg ${done ? 'done' : ''} ${cur ? (bad ? 'bad' : 'cur') : ''}`}>
            <i>{done ? <CheckCircle2 size={14} /> : cur && bad ? <XCircle size={14} /> : i + 1}</i>
            <span>{t(s)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Page title, meta description and language from the CMS (WEB-03). */
export function useSeo(pageKey) {
  const { lang, t } = useLang();
  useEffect(() => {
    const page = getPlatform().content.pages[pageKey];
    if (!page) return;
    const title = localized(page, 'seoTitle', lang, t) || localized(page, 'title', lang, t);
    if (title) document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'description'); document.head.appendChild(meta); }
    meta.setAttribute('content', localized(page, 'seoDesc', lang, t) || '');
  }, [pageKey, lang, t]);
}

/** Text for a CMS page field in the current language. */
export function usePage(pageKey) {
  const { lang, t } = useLang();
  const page = getPlatform().content.pages[pageKey] || {};
  return { title: localized(page, 'title', lang, t), subtitle: localized(page, 'subtitle', lang, t), heroImage: page.heroImage };
}

/** Bilingual tax invoice / credit note (INV-01, INV-02). No other party's name appears on it (BR-23). */
export function TaxDoc({ doc }) {
  const { t, lang, locale } = useLang();
  const s = doc.seller;
  const isCn = doc.type === 'Credit note';
  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const line = (l) => (typeof l.desc === 'string' ? t(l.desc) : t(l.desc.key, { ...(l.desc.vars || {}), name: t(l.desc.vars?.name), period: t(l.desc.vars?.period), type: t(l.desc.vars?.type) }));
  return (
    <div className="taxdoc" id={`doc-${doc.id}`} dir="ltr">
      <div className="td-head">
        <div>
          <img src="/brand/mei-logo.png" alt="Model E-Invoice" style={{ height: 40 }} />
          <div style={{ marginTop: 6 }}><b>{s.legalName}</b><br /><span dir="rtl">{s.legalNameAr}</span></div>
          <div>{s.address}</div>
          <div>TRN: <b>{s.trn}</b> · {s.licence}</div>
        </div>
        <div className="td-title">
          <h2>{isCn ? 'Tax Credit Note' : 'Tax Invoice'}</h2>
          <div className="ar">{isCn ? 'إشعار دائن ضريبي' : 'فاتورة ضريبية'}</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6 }}>{doc.id}</div>
        </div>
      </div>
      <div className="td-meta">
        <div><span>Date · التاريخ</span><b>{fmtDate(doc.date, 'en-GB')}</b></div>
        <div><span>Payment · الدفع</span><b>{doc.paymentMethod}</b></div>
        <div><span>Status · الحالة</span><b>{doc.status}</b></div>
        <div><span>{isCn ? 'Original invoice · الفاتورة الأصلية' : 'Contract · العقد'}</span><b>{isCn ? doc.refInvoice : (doc.contractRef || '—')}</b></div>
      </div>
      <div className="td-parties">
        <div><span className="muted">Supplier · المورد</span><b>{s.legalName}</b>TRN {s.trn}</div>
        <div><span className="muted">Customer · العميل</span><b>{doc.customer.legalName || doc.customer.name}</b>{doc.customer.trn ? `TRN ${doc.customer.trn}` : 'Not registered for VAT · غير مسجل'}<br />{doc.customer.address}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description<small>الوصف</small></th><th className="num">Qty<small>الكمية</small></th><th className="num">Amount (AED)<small>المبلغ</small></th><th className="num">VAT {doc.vatRate}%<small>الضريبة</small></th><th className="num">Total<small>الإجمالي</small></th></tr></thead>
        <tbody>
          {doc.lines.map((l, i) => {
            const vat = +(l.amount * doc.vatRate / 100).toFixed(2);
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{line(l)}{l.period ? <small className="muted" style={{ display: 'block' }}>{l.period}</small> : null}{l.qty ? <small className="muted" style={{ display: 'block' }}>{l.qty} × {money(l.unitPrice)}</small> : null}</td>
                <td className="num">{l.qty || 1}</td>
                <td className="num">{money(l.amount)}</td>
                <td className="num">{money(vat)}</td>
                <td className="num">{money(l.amount + vat)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="td-tot">
        <div><span>Total excl. VAT · الإجمالي قبل الضريبة</span><b>{money(doc.subtotal)}</b></div>
        <div><span>VAT {doc.vatRate}% · ضريبة القيمة المضافة</span><b>{money(doc.vat)}</b></div>
        <div className="grand"><span>Total AED · الإجمالي</span><b>{money(doc.total)}</b></div>
      </div>
      {isCn && doc.reason && <p style={{ marginTop: 10 }}><b>Reason · السبب:</b> {doc.reason}</p>}
      <div className="td-foot">
        {lang === 'ar' ? 'هذه فاتورة صادرة إلكترونياً ولا تحتاج إلى توقيع.' : 'This document is issued electronically and does not need a signature.'} · {s.email} · {new Date(doc.date).toLocaleDateString(locale)}
      </div>
    </div>
  );
}

/** Save the document as a PDF (rendered from the HTML so Arabic is correct). */
export async function downloadDocPdf(doc) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const el = document.getElementById(`doc-${doc.id}`);
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const h = (canvas.height * pw) / canvas.width;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 20, pw, h);
  pdf.setProperties({ title: doc.id, creator: 'Model E-Invoice' });
  pdf.save(`${doc.id}.pdf`);
}

export const E_STATUS_BADGE = { Sent: 'green', Queued: 'blue', 'Awaiting linking': 'orange', Rejected: 'red', 'Not required': 'gray' };
