import { useState } from 'react';
import ReportGrid from '../../components/ReportGrid';
import { Download, Receipt, Percent, CheckCircle2, Calculator } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { useDbVersion } from '../../hooks/useDb';
import { companyReport, RANGES, exportSheets, thisMonth, DATE_PRESETS, rangeKey } from '../../services/reports';
import { StackedBars, Legend, HBars, Donut, Stat, DateRangeFilter, rangeText } from '../../components/AdminCharts';
import { formatMoney } from '../../data/packages';
import { TAX_CATEGORIES } from '../../data/ubl';

const KEYS = [{ id: 'sent', color: '#1f7fb5', label: 'Passed' }, { id: 'failed', color: '#ef4444', label: 'Failed' }];
const SRC_COLOR = { Manual: '#3DB4D2', Excel: '#C99B5B', API: '#092F58' };

const GRIDS = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'customers', label: 'By customer' },
  { id: 'items', label: 'By item' },
  { id: 'vat', label: 'VAT summary' },
];

function gridDef(id, r, vatRows, t) {
  switch (id) {
    case 'customers':
      return {
        columns: [{ key: 'label', label: 'Customer', strong: true }, { key: 'count', label: 'Invoices', type: 'number' }, { key: 'net', label: 'Net', type: 'money' }, { key: 'vat', label: 'VAT', type: 'money' }, { key: 'value', label: 'Total incl. VAT', type: 'money' }],
        rows: r.customers.map((c) => ({ ...c, key: c.label, net: +(c.value - c.vat).toFixed(2) })), initialSort: { key: 'value', dir: 'desc' },
      };
    case 'items':
      return {
        columns: [{ key: 'label', label: 'Item', strong: true }, { key: 'qty', label: 'Quantity', type: 'number' }, { key: 'unit', label: 'Unit', ltr: true }, { key: 'value', label: 'Net amount', type: 'money' }],
        rows: r.items.map((i) => ({ ...i, key: i.label })), initialSort: { key: 'value', dir: 'desc' },
      };
    case 'vat':
      return {
        columns: [{ key: 'code', label: 'VAT category', ltr: true, strong: true }, { key: 'name', label: 'Description' }, { key: 'rate', label: 'Rate', type: 'percent', total: false }, { key: 'taxable', label: 'Taxable amount', type: 'money' }, { key: 'tax', label: 'VAT', type: 'money' }],
        rows: vatRows.map((v) => ({ key: v.code, code: v.code, name: t(v.label, { rate: v.rate }), rate: v.rate, taxable: +v.taxable.toFixed(2), tax: +v.tax.toFixed(2) })),
      };
    default:
      return {
        columns: [
          { key: 'id', label: 'Invoice', ltr: true, strong: true }, { key: 'issueDate', label: 'Issue date', type: 'date' }, { key: 'customerName', label: 'Customer' },
          { key: 'source', label: 'Source', translate: true }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'net', label: 'Net', type: 'money' },
          { key: 'vat', label: 'VAT', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'wlInvoiceId', label: 'Qvalia ID', ltr: true },
        ],
        rows: r.invoices.map((i) => ({ ...i, net: +(i.subtotal - (i.discount || 0)).toFixed(2) })), initialSort: { key: 'issueDate', dir: 'desc' },
      };
  }
}

/** Reports for one customer company: what they invoiced, to whom, which items, and the VAT summary. */
export default function CompanyReports() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  useDbVersion();
  const [range, setRange] = useState(thisMonth);
  const [grid, setGrid] = useState('invoices');
  const r = companyReport(user, range);
  const rangeLabel = rangeText(range, locale);
  const vatRows = TAX_CATEGORIES.map((c) => ({ ...c, ...r.vat[c.code] }));

  const exportIt = () => exportSheets(`${(user.company?.name || 'company').replace(/\W+/g, '-')}-report-${rangeKey(range)}.xlsx`, [
    ['Summary', [['Metric', 'Value'], ['Period', `${range.from} – ${range.to}`], ['Invoices', r.total], ['Passed', r.success], ['Failed', r.failed], ['In progress', r.inProgress], ['Amount invoiced incl. VAT (AED)', +r.amount.toFixed(2)], ['Net amount (AED)', +r.net.toFixed(2)], ['VAT (AED)', +r.vatTotal.toFixed(2)], ['Average invoice (AED)', +r.avg.toFixed(2)]]],
    ['Invoices', [['Invoice', 'Date', 'Customer', 'Source', 'Status', 'Subtotal', 'Discount', 'VAT', 'Total', 'Qvalia ID'], ...r.invoices.map((i) => [i.id, i.issueDate, i.customerName, i.source, i.status, i.subtotal, i.discount || 0, i.vat, i.total, i.wlInvoiceId || ''])]],
    ['Customers', [['Customer', 'Invoices', 'VAT', 'Total incl. VAT'], ...r.customers.map((c) => [c.label, c.count, +c.vat.toFixed(2), +c.value.toFixed(2)])]],
    ['Items', [['Item', 'Quantity', 'Unit', 'Net amount'], ...r.items.map((i) => [i.label, i.qty, i.unit, +i.value.toFixed(2)])]],
    ['VAT summary', [['VAT category', 'Rate', 'Taxable amount', 'VAT'], ...vatRows.map((v) => [`${v.code} · ${v.label}`, `${v.rate}%`, +v.taxable.toFixed(2), +v.tax.toFixed(2)])]],
  ]);

  return (
    <>
      <div className="card mb-2">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <div><h3>{t('Reports')}</h3><small>{t('What your company invoiced, to whom, and the VAT to declare.')}</small></div>
          <div className="flex gap-1 wrap"><DateRangeFilter value={range} onChange={setRange} presets={DATE_PRESETS} /><button className="btn btn-outline btn-sm" onClick={exportIt}><Download size={15} /> {t('Export all (Excel)')}</button></div>
        </div>
      </div>

      <div className="stat-grid">
        <Stat icon={Receipt} label="Amount invoiced" value={formatMoney(Math.round(r.amount))} sub={t('{n} invoices passed · {range}', { n: r.success, range: rangeLabel })} />
        <Stat icon={Percent} tone="purple" label="VAT on your invoices" value={formatMoney(Math.round(r.vatTotal))} sub={t('Net {v}', { v: formatMoney(Math.round(r.net)) })} />
        <Stat icon={CheckCircle2} tone="green" label="Invoices passed / failed" value={`${r.success} / ${r.failed}`} sub={t('{n} in progress', { n: r.inProgress })} />
        <Stat icon={Calculator} tone="orange" label="Average invoice" value={formatMoney(Math.round(r.avg))} />
      </div>

      <div className="grid-2 mt-2">
        <div className="card">
          <div className="card-head"><div><h3>{t('Invoices')}</h3><small>{rangeLabel}</small></div><Legend keys={KEYS} /></div>
          <StackedBars data={r.series.map((x) => ({ ...x, parts: { sent: x.sent, failed: x.failed } }))} keys={KEYS} unit={r.unit} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('How invoices were created')}</h3></div>
          <Donut parts={r.sources.map((s) => ({ ...s, color: SRC_COLOR[s.label] }))} center={{ value: r.total, label: 'Invoices' }} />
        </div>
      </div>

      <div className="grid-2e mt-2">
        <div className="card">
          <div className="card-head"><h3>{t('Top customers')}</h3><small>{t('Amount incl. VAT')}</small></div>
          <HBars money rows={r.customers.slice(0, 8).map((c) => ({ label: c.label, value: c.value, sub: t('{n} invoices', { n: c.count }) }))} color="#092F58" />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Top items')}</h3><small>{t('Net amount')}</small></div>
          <HBars money rows={r.items.slice(0, 8).map((i) => ({ label: i.label, value: i.value, sub: `${i.qty.toLocaleString()} ${i.unit}` }))} color="#3DB4D2" />
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-head"><div><h3>{t('VAT summary')}</h3><small>{t('Passed invoices only, after discounts. Use it to prepare your VAT return.')}</small></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('VAT category')}</th><th>{t('Rate')}</th><th>{t('Taxable amount')}</th><th>{t('VAT')}</th></tr></thead>
            <tbody>
              {vatRows.map((v) => (
                <tr key={v.code}><td><b dir="ltr">{v.code}</b> · {t(v.label, { rate: v.rate })}</td><td dir="ltr">{v.rate}%</td><td dir="ltr">{formatMoney(v.taxable.toFixed(2))}</td><td dir="ltr">{formatMoney(v.tax.toFixed(2))}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td><b>{t('Total')}</b></td><td /><td dir="ltr"><b>{formatMoney(vatRows.reduce((a, v) => a + v.taxable, 0).toFixed(2))}</b></td><td dir="ltr"><b>{formatMoney(vatRows.reduce((a, v) => a + v.tax, 0).toFixed(2))}</b></td></tr></tfoot>
          </table>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-head">
          <div><h3>{t('Detailed report')}</h3><small>{rangeLabel} · {user.company?.name}</small></div>
          <div className="chip-group">
            {GRIDS.map((g) => <button key={g.id} className={`chip ${grid === g.id ? 'on' : ''}`} onClick={() => setGrid(g.id)}>{t(g.label)}</button>)}
          </div>
        </div>
        <ReportGrid
          key={`${grid}-${rangeKey(range)}`}
          title={`${t(GRIDS.find((g) => g.id === grid).label)} · ${user.company?.name || ''}`}
          subtitle={rangeLabel}
          meta={[user.company?.name, user.company?.trn ? `${t('TRN')}: ${user.company.trn}` : null].filter(Boolean)}
          fileName={`${(user.company?.name || 'company').replace(/\W+/g, '-')}-${grid}-${rangeKey(range)}`}
          {...gridDef(grid, r, vatRows, t)}
        />
      </div>
    </>
  );
}
