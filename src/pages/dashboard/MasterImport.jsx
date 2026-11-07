import { useState } from 'react';
import { FileSpreadsheet, Download, Upload, Loader2, CheckCircle2, AlertCircle, Plus, RefreshCw, MinusCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { parseRows, importLines, downloadWorkbook, readSheet, COLUMNS } from '../../services/masterImport';
import { Modal } from './MasterForms';

const TITLE = { customers: 'Import customers from Excel', products: 'Import items from Excel', categories: 'Import categories from Excel' };
const ACTION = {
  add: { cls: 'green', icon: Plus, label: 'New' },
  update: { cls: 'blue', icon: RefreshCw, label: 'Update' },
  skip: { cls: 'red', icon: MinusCircle, label: 'Skipped' },
};

export default function MasterImport({ collection, onClose }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [lines, setLines] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [over, setOver] = useState(false);

  const read = async (file) => {
    if (!file) return;
    setError(''); setDone(null); setLines(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError(t('Unsupported file. Use the .xlsx template.')); return; }
    setFileName(file.name); setBusy(true);
    try {
      const rows = await readSheet(file);
      const parsed = parseRows(user, collection, rows);
      if (!parsed.length) setError(t('The file has no data rows.'));
      else if (!rows.some((r) => Object.keys(r).some((h) => h.replace(/[^a-z]/gi, '').toLowerCase() === 'name'))) setError(t('Column "Name" was not found. Use the template.'));
      else setLines(parsed);
    } catch { setError(t('The file could not be read.')); }
    setBusy(false);
  };

  const run = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 400));
    setDone(importLines(user, collection, lines));
    setLines(null); setBusy(false);
  };

  const counts = lines && { add: lines.filter((l) => l.action === 'add').length, update: lines.filter((l) => l.action === 'update').length, skip: lines.filter((l) => l.action === 'skip').length };
  const newCats = lines ? new Set(lines.filter((l) => l.action !== 'skip' && l.record._newCategory).map((l) => l.record._newCategory.name)) : new Set();
  const required = COLUMNS[collection].filter((c) => c[2]).map((c) => c[0]).join(', ');

  const footer = (
    <>
      <span className="muted" style={{ fontSize: 13 }}>
        {counts ? t('{add} new · {update} to update · {skip} skipped', counts) : t('Required columns: {cols}', { cols: required })}
      </span>
      <div className="flex gap-1">
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t(done ? 'Close' : 'Cancel')}</button>
        {lines && <button type="button" className="btn btn-primary btn-sm" disabled={busy || !(counts.add + counts.update)} onClick={run}>
          {busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} {t('Import {n} rows', { n: counts.add + counts.update })}
        </button>}
      </div>
    </>
  );

  return (
    <Modal title={t(TITLE[collection])} icon={FileSpreadsheet} onClose={onClose} footer={footer} wide>
      {done ? (
        <div className="import-done">
          <CheckCircle2 size={40} />
          <h3>{t('Import finished')}</h3>
          <div className="import-stats">
            <div><b>{done.added}</b><span>{t('Added')}</span></div>
            <div><b>{done.updated}</b><span>{t('Updated')}</span></div>
            <div><b>{done.skipped}</b><span>{t('Skipped')}</span></div>
            {done.categoriesAdded > 0 && <div><b>{done.categoriesAdded}</b><span>{t('New categories')}</span></div>}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDone(null); setFileName(''); }}><RotateCcw size={15} /> {t('Import another file')}</button>
        </div>
      ) : (
        <>
          <div className="import-top">
            <label
              className={`dropzone ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]); }}
            >
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { read(e.target.files[0]); e.target.value = ''; }} />
              {busy ? <Loader2 size={30} className="spin" /> : <FileSpreadsheet size={30} />}
              <strong>{t('Drop your Excel file here or click to choose')}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{t('One row per record. Existing records are updated, new ones are added.')}</span>
              {fileName && <span className="chip-mini" dir="ltr">{fileName}</span>}
            </label>
            <div className="card-soft">
              <h4 className="mb-1">{t('Start from a file')}</h4>
              <button type="button" className="btn btn-outline btn-sm btn-block mb-1" onClick={() => downloadWorkbook(user, collection)}><Download size={15} /> {t('Download template')}</button>
              <button type="button" className="btn btn-outline btn-sm btn-block" onClick={() => downloadWorkbook(user, collection, { withData: true })}><Download size={15} /> {t('Export current list')}</button>
              <p className="muted mt-1 mb-0" style={{ fontSize: 12.5 }}>{t('Tip: export, edit in Excel and import again to update many records at once.')}</p>
            </div>
          </div>

          {error && <div className="alert error mt-2"><AlertCircle size={18} /> {error}</div>}

          {lines && (
            <>
              {newCats.size > 0 && <div className="alert info mt-2"><Plus size={16} /> {t('New categories will be created: {names}', { names: [...newCats].join(', ') })}</div>}
              <div className="table-wrap mt-2 import-table">
                <table>
                  <thead><tr><th>{t('Row')}</th><th>{t('Name')}</th><th>{collection === 'customers' ? t('TRN') : collection === 'products' ? t('SKU / code') : t('Default VAT')}</th><th>{t('Result')}</th></tr></thead>
                  <tbody>
                    {lines.map((l) => {
                      const a = ACTION[l.action];
                      return (
                        <tr key={l.row} className={l.action === 'skip' ? 'row-bad' : ''}>
                          <td dir="ltr" className="muted">{l.row}</td>
                          <td><b>{l.record.name || '—'}</b>{l.action === 'update' && l.matchName && l.matchName !== l.record.name && <div className="muted" style={{ fontSize: 12 }}>{t('was {name}', { name: l.matchName })}</div>}</td>
                          <td dir="ltr" className="muted">{(collection === 'customers' ? l.record.trn : collection === 'products' ? l.record.sku : l.record.defaultTaxCategory) || '—'}</td>
                          <td>
                            <span className={`badge ${a.cls}`}><a.icon size={12} /> {t(a.label)}</span>
                            {l.errors.map((e, i) => <div key={i} className="text-danger" style={{ fontSize: 12.5, marginTop: 4 }}>{t(e.key, e.vars)}</div>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
