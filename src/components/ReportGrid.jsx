import { useEffect, useMemo, useState } from 'react';
import { Search, Printer, FileText, FileSpreadsheet, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';
import { formatMoney } from '../data/packages';
import { fmtDate } from '../utils/format';
import { exportExcel, exportPdf, printReport, columnTotals } from '../services/exporters';

const NUMERIC = ['money', 'number', 'percent'];
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const BADGE = {
  Success: 'green', Paid: 'green', Active: 'green', Resolved: 'green', Passed: 'green',
  Failed: 'red', Expired: 'red', Refunded: 'gray', 'Refunded (Locked)': 'red', Urgent: 'red',
  Queued: 'orange', Retrying: 'orange', Open: 'orange', High: 'orange', Pending: 'orange',
  Processing: 'blue', 'Sent to White Label': 'blue', 'In progress': 'blue', Normal: 'blue',
  Cancelled: 'gray', 'No package': 'gray', Low: 'gray', Inactive: 'gray', 'Waiting for customer': 'purple',
};

/**
 * Searchable, sortable, paged table with Print, PDF and Excel export.
 * columns: [{ key, label, type: 'text'|'money'|'number'|'percent'|'date'|'badge', translate?, ltr?, total? }]
 * Exports use what the grid shows: the search and sort applied, every page.
 */
export default function ReportGrid({ title, subtitle, columns, rows, fileName, meta = [], totals = true, initialSort = null, pageSize: ps = 25, toolbar = null, empty = 'No data for this period.' }) {
  const { t, locale, lang } = useLang();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort); // { key, dir: 'asc'|'desc' }
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(ps);
  const [busy, setBusy] = useState('');

  useEffect(() => { setPage(0); }, [q, rows, pageSize]);

  const fmt = (c, v, r) => {
    if (v === null || v === undefined || v === '') return c.type && NUMERIC.includes(c.type) ? '—' : '—';
    if (c.format) return c.format(v, r, t);
    switch (c.type) {
      case 'money': return formatMoney(Number(v).toFixed(2));
      case 'number': return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
      case 'percent': return `${Number(v).toFixed(1)}%`;
      case 'date': return fmtDate(v, locale);
      case 'badge': return t(c.statusKey ? `${v}|status` : v);
      default: return c.translate ? t(v) : String(v);
    }
  };
  const searchText = (r) => columns.map((c) => `${r[c.key] ?? ''} ${fmt(c, r[c.key], r)}`).join(' ').toLowerCase();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let l = s ? rows.filter((r) => s.split(/\s+/).every((w) => searchText(r).includes(w))) : rows;
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      const num = c && (NUMERIC.includes(c.type));
      l = [...l].sort((a, b) => {
        const x = a[sort.key]; const y = b[sort.key];
        const r = num ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return sort.dir === 'asc' ? r : -r;
      });
    }
    return l;
  }, [rows, q, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const tt0 = totals ? columnTotals(columns, filtered) : null;
  const tt = tt0 && Object.keys(tt0).length ? tt0 : null;
  const toggleSort = (key) => setSort((s) => (s?.key !== key ? { key, dir: NUMERIC.includes(columns.find((c) => c.key === key)?.type) ? 'desc' : 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : s.dir === 'desc' ? null : { key, dir: 'asc' }));

  const exportDef = () => {
    const now = new Date().toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    return {
      title, subtitle, dir: lang === 'ar' ? 'rtl' : 'ltr', fileName: /\d{4}-\d{2}-\d{2}/.test(fileName) ? fileName : `${fileName}-${localDay()}`,
      columns: columns.map((c) => ({ ...c, label: t(c.label) })), rows: filtered, totals: !!tt, fmt: (c, v, r) => fmt(c, v, r),
      meta: [...meta, q ? t('Search: “{q}”', { q }) : null, t('{n} rows', { n: filtered.length.toLocaleString() }), t('Generated {date}', { date: now })].filter(Boolean),
      labels: { total: t('Total'), brand: 'Model E-Invoice', continued: t('continued'), page: t('Page {n} of {total}'), generated: t('Generated {date}', { date: now }) },
    };
  };
  const run = async (kind) => {
    setBusy(kind);
    try {
      const d = exportDef();
      if (kind === 'excel') await exportExcel(d);
      else if (kind === 'pdf') await exportPdf(d);
      else printReport(d);
    } finally { setTimeout(() => setBusy(''), 300); }
  };

  const from = filtered.length ? page * pageSize + 1 : 0;
  const to = Math.min(filtered.length, (page + 1) * pageSize);

  return (
    <div className="rgrid">
      <div className="rgrid-bar">
        <div className="input-wrap rgrid-search">
          <Search size={16} />
          <input className="input" placeholder={t('Search in this report…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search in this report…')} />
          {q && <button className="rgrid-clear" onClick={() => setQ('')} aria-label={t('Clear')}><X size={14} /></button>}
        </div>
        {toolbar}
        <div className="rgrid-actions">
          <button className="btn btn-outline btn-sm" onClick={() => run('print')} disabled={!!busy || !filtered.length}><Printer size={15} /> {t('Print')}</button>
          <button className="btn btn-outline btn-sm" onClick={() => run('pdf')} disabled={!!busy || !filtered.length}>{busy === 'pdf' ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} {t('PDF')}</button>
          <button className="btn btn-outline btn-sm" onClick={() => run('excel')} disabled={!!busy || !filtered.length}>{busy === 'excel' ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />} {t('Excel')}</button>
        </div>
      </div>

      <div className="table-wrap rgrid-table">
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const on = sort?.key === c.key;
                const Icon = !on ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
                return (
                  <th key={c.key} className={NUMERIC.includes(c.type) ? 'num' : ''} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button className={`th-sort ${on ? 'on' : ''}`} onClick={() => toggleSort(c.key)}>{t(c.label)} <Icon size={13} /></button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.id || r.key || `${page}-${i}`}>
                {columns.map((c) => {
                  const v = r[c.key];
                  const text = fmt(c, v, r);
                  return (
                    <td key={c.key} className={NUMERIC.includes(c.type) ? 'num' : c.type === 'date' || c.nowrap ? 'nw' : ''} dir={NUMERIC.includes(c.type) || c.ltr ? 'ltr' : undefined}>
                      {c.type === 'badge' && v ? <span className={`badge ${BADGE[v] || 'gray'}`}>{text}</span> : c.strong ? <strong>{text}</strong> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!view.length && <tr><td colSpan={columns.length} className="center muted" style={{ padding: 30 }}>{q ? t('No results for “{q}”.', { q }) : t(empty)}</td></tr>}
          </tbody>
          {tt && filtered.length > 0 && (
            <tfoot>
              <tr>{columns.map((c, i) => <td key={c.key} className={NUMERIC.includes(c.type) ? 'num' : ''} dir={tt[c.key] !== undefined ? 'ltr' : undefined}>{i === 0 ? t('Total') : tt[c.key] !== undefined ? fmt(c, tt[c.key], {}) : ''}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="rgrid-pager">
        <span className="muted">{t('Showing {from}–{to} of {n}', { from: from.toLocaleString(), to: to.toLocaleString(), n: filtered.length.toLocaleString() })}{q && rows.length !== filtered.length ? ` · ${t('filtered from {n}', { n: rows.length.toLocaleString() })}` : ''}</span>
        <div className="flex items-center gap-1">
          <select className="input input-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label={t('Rows per page')}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{t('{n} per page', { n })}</option>)}
          </select>
          <button className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t('Previous page')}><ChevronLeft size={16} className="flip-rtl" /></button>
          <span dir="ltr" style={{ fontSize: 13 }}>{page + 1} / {pages}</span>
          <button className="icon-btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label={t('Next page')}><ChevronRight size={16} className="flip-rtl" /></button>
        </div>
      </div>
    </div>
  );
}
