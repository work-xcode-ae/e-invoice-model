// Export a report (title, columns, rows) to Excel, PDF or the printer.
// The caller passes already-translated labels and a `fmt(col, value)` formatter so the output matches the screen.
// PDF is drawn from HTML (html2canvas → jsPDF) so Arabic and right-to-left text render exactly like the app.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NUMERIC = ['money', 'number', 'percent'];

/** Sum of each numeric column (for the totals row). */
export function columnTotals(columns, rows) {
  return Object.fromEntries(columns.filter((c) => NUMERIC.includes(c.type) && c.total !== false && c.type !== 'percent')
    .map((c) => [c.key, rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)]));
}

// ---------- Excel ----------
export async function exportExcel({ title, meta = [], columns, rows, totals, fileName, labels }) {
  const XLSX = await import('xlsx');
  const head = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (NUMERIC.includes(c.type)) return v === '' || v === null || v === undefined ? '' : Number(v);
    if (c.type === 'date') return v ? String(v).slice(0, 10) : '';
    return c.text ? c.text(v, r) : (v ?? '');
  }));
  const aoa = [[title], ...meta.map((m) => [m]), [], head, ...body];
  if (totals) { const tt = columnTotals(columns, rows); aoa.push(columns.map((c, i) => (i === 0 ? labels.total : tt[c.key] !== undefined ? +tt[c.key].toFixed(2) : ''))); }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const headerRow = meta.length + 2; // 0-based row index of the column headers
  ws['!cols'] = columns.map((c, i) => ({ wch: Math.min(45, Math.max(10, String(c.label).length + 2, ...body.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + body.length, c: columns.length - 1 } }) };
  // number formats
  columns.forEach((c, ci) => {
    const z = c.type === 'money' ? '#,##0.00' : c.type === 'percent' ? '0.0"%"' : c.type === 'number' ? '#,##0' : null;
    if (!z) return;
    for (let r = headerRow + 1; r <= headerRow + body.length + (totals ? 1 : 0); r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (cell && typeof cell.v === 'number') cell.z = z; }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(title).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// ---------- HTML used by print and PDF ----------
const CSS = (dir) => `
  .rp { font-family: ${dir === 'rtl' ? "'IBM Plex Sans Arabic', " : ''}'Plus Jakarta Sans', system-ui, sans-serif; color: #0f1e33; direction: ${dir}; background: #fff; box-sizing: border-box; }
  .rp * { box-sizing: border-box; }
  .rp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #092F58; padding-bottom: 10px; margin-bottom: 12px; }
  .rp-brand { font: 300 11px/1 Montserrat, sans-serif; letter-spacing: .32em; color: #092F58; text-transform: uppercase; }
  .rp-brand b { display: block; font: 800 20px/1.2 'Plus Jakarta Sans', sans-serif; letter-spacing: 0; color: #092F58; text-transform: none; margin-bottom: 4px; }
  .rp-title { font-size: 18px; font-weight: 700; margin: 0 0 4px; color: #092F58; }
  .rp-meta { font-size: 11px; color: #5b6b82; line-height: 1.5; text-align: ${dir === 'rtl' ? 'left' : 'right'}; }
  .rp-sub { font-size: 11.5px; color: #5b6b82; margin: 0 0 10px; }
  .rp table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .rp th { background: #092F58; color: #fff; font-weight: 600; text-align: start; padding: 7px 8px; }
  .rp td { padding: 4.5px 8px; border-bottom: 1px solid #e4e9f0; vertical-align: top; }
  .rp tbody tr:nth-child(even) td { background: #f6f9fc; }
  .rp td.num, .rp th.num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rp tfoot td { font-weight: 700; border-top: 2px solid #092F58; border-bottom: 0; background: #eef6fa; }
  .rp-foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; font-size: 10px; color: #8a97ab; padding: 0 0 2px; }
  .rp [dir=ltr] { direction: ltr; unicode-bidi: embed; }
  @media print { @page { size: A4 ${'${orient}'}; margin: 12mm; } .rp thead { display: table-header-group; } .rp tfoot { display: table-row-group; } .rp tr { break-inside: avoid; } }
`;

function headHtml({ title, subtitle, meta, labels }) {
  return `<div class="rp-head"><div><div class="rp-brand"><b>MEI</b>${esc(labels.brand)}</div></div><div class="rp-meta">${meta.map(esc).join('<br>')}</div></div>
    <h1 class="rp-title">${esc(title)}</h1>${subtitle ? `<p class="rp-sub">${esc(subtitle)}</p>` : ''}`;
}

function tableHtml({ columns, rows, totals, fmt, labels, totalsRow }) {
  const cls = (c) => (NUMERIC.includes(c.type) ? ' class="num"' : '');
  const cell = (c, r) => { const v = fmt(c, r[c.key], r); return `<td${cls(c)}${NUMERIC.includes(c.type) || c.ltr ? ' dir="ltr"' : ''}>${esc(v)}</td>`; };
  const tt = totalsRow || (totals ? columnTotals(columns, rows) : null);
  return `<table><thead><tr>${columns.map((c) => `<th${cls(c)}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => cell(c, r)).join('')}</tr>`).join('')}</tbody>
    ${tt ? `<tfoot><tr>${columns.map((c, i) => (i === 0 ? `<td>${esc(labels.total)}</td>` : tt[c.key] !== undefined ? `<td class="num" dir="ltr">${esc(fmt(c, tt[c.key], {}))}</td>` : '<td></td>')).join('')}</tr></tfoot>` : ''}</table>`;
}

// ---------- Print ----------
export function printReport(def) {
  const { dir = 'ltr', columns } = def;
  const orient = columns.length > 6 ? 'landscape' : 'portrait';
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const fonts = [...document.querySelectorAll('style, link[rel="stylesheet"]')].filter((n) => /font-face|fontsource/i.test(n.textContent || n.href || '')).map((n) => n.outerHTML).join('');
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(def.title)}</title>${fonts}<style>${CSS(dir).replace('${orient}', orient)} body{margin:0}</style></head>
    <body><div class="rp">${headHtml(def)}${tableHtml({ ...def, totals: def.totals })}</div></body></html>`);
  doc.close();
  const go = () => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => iframe.remove(), 1500); };
  (iframe.contentDocument.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 150));
}

// ---------- PDF ----------
/**
 * A4 PDF with the header on page 1, the column headers repeated on every page, totals on the last page
 * and "page x of y" in the footer. Rows are never cut between pages.
 */
export async function exportPdf(def) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const { dir = 'ltr', columns, rows, labels, fileName } = def;
  const landscape = columns.length > 6;
  const W = landscape ? 1123 : 794; const H = landscape ? 794 : 1123; const M = 36; // px at 96 dpi
  const style = document.createElement('style'); style.textContent = CSS(dir).replace(/@media print[\s\S]*$/, '');
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:0;top:0;z-index:-1;width:${W}px;pointer-events:none;`;
  document.head.appendChild(style); document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    // 1) measure the header, the column header and each row at page width
    host.innerHTML = `<div class="rp" style="width:${W}px;padding:${M}px">${headHtml(def)}${tableHtml({ ...def, totals: def.totals })}</div>`;
    const headH = host.querySelector('.rp-head').offsetHeight + host.querySelector('.rp-title').offsetHeight + (host.querySelector('.rp-sub')?.offsetHeight || 0) + 14;
    const theadH = host.querySelector('thead').offsetHeight;
    const footH = host.querySelector('tfoot')?.offsetHeight || 0;
    const rowH = [...host.querySelectorAll('tbody tr')].map((tr) => tr.offsetHeight);
    const avail = H - 2 * M - 24; // room for the page footer
    // 2) group rows into pages
    const pages = []; let cur = []; let used = headH + theadH;
    rowH.forEach((h, i) => {
      if (used + h > avail && cur.length) { pages.push(cur); cur = []; used = theadH + 18; }
      cur.push(i); used += h;
    });
    if (cur.length || !pages.length) pages.push(cur);
    if (def.totals && used + footH > avail && pages[pages.length - 1].length > 1) { const last = pages[pages.length - 1]; pages.push([last.pop()]); }
    // 3) draw each page
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(); const ph = pdf.internal.pageSize.getHeight();
    for (let p = 0; p < pages.length; p++) {
      const isLast = p === pages.length - 1;
      const slice = pages[p].map((i) => rows[i]);
      host.innerHTML = `<div class="rp" style="width:${W}px;height:${H}px;padding:${M}px;position:relative">
        ${p === 0 ? headHtml(def) : `<div class="rp-sub" style="margin-bottom:8px"><b>${esc(def.title)}</b> · ${esc(labels.continued)}</div>`}
        ${tableHtml({ ...def, rows: slice, totals: isLast && def.totals, totalsRow: isLast && def.totals ? columnTotals(columns, rows) : null })}
        <div class="rp-foot" style="padding:0 ${M}px ${M / 2}px"><span>${esc(labels.generated)}</span><span dir="ltr">${esc(labels.page.replace('{n}', p + 1).replace('{total}', pages.length))}</span></div></div>`;
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
      if (p) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
    }
    pdf.setProperties({ title: def.title, creator: 'Model E-Invoice' });
    pdf.save(`${fileName}.pdf`);
  } finally {
    host.remove(); style.remove();
  }
}
