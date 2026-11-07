import { useState } from 'react';
import { useLang } from '../i18n/LanguageContext';
import { formatMoney } from '../data/packages';

const fmtLabel = (iso, unit, locale) => {
  const d = new Date(iso);
  if (unit === 'month') return d.toLocaleDateString(locale, { month: 'short' });
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
};
const compact = (v, money) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(v));
  return money ? s : s;
};

/** Stacked bars. data: [{ date, parts: { key: value } }], keys: [{ id, color, label }]. */
export function StackedBars({ data, keys, unit = 'month', money = false, height = 230, line = null }) {
  const { t, locale } = useLang();
  const [hover, setHover] = useState(null);
  const W = 680, H = height, padL = 44, padB = 26, padT = 12;
  const totals = data.map((d) => keys.reduce((a, k) => a + (d.parts[k.id] || 0), 0));
  const max = Math.max(...totals, ...(line ? data.map((d) => d[line.key] || 0) : []), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = Math.ceil(max / step) * step;
  const plotW = W - padL - 8, plotH = H - padB - padT;
  const slot = plotW / data.length, bw = Math.min(30, slot * 0.6);
  const y = (v) => padT + plotH - (v / nice) * plotH;
  const every = Math.ceil(data.length / 12);
  const linePts = line ? data.map((d, i) => [padL + i * slot + slot / 2, y(Math.max(0, d[line.key] || 0))]) : [];

  return (
    <div className="chart-wrap" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
        {[0, nice / 2, nice].map((v) => (
          <g key={v}><line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#eef1f6" /><text x={padL - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">{compact(v, money)}</text></g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          const x = padL + i * slot + (slot - bw) / 2;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill={hover === i ? 'rgba(61,180,210,.07)' : 'transparent'} />
              {keys.map((k) => {
                const v = d.parts[k.id] || 0;
                if (!v) return null;
                const top = y(acc + v), h = y(acc) - top; acc += v;
                return <rect key={k.id} x={x} y={top} width={bw} height={Math.max(h - 1, 1)} rx="3" fill={k.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
              })}
              {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="chart-tick">{fmtLabel(d.date, unit, locale)}</text>}
            </g>
          );
        })}
        {line && <path d={linePts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke={line.color} strokeWidth="2.2" strokeLinejoin="round" pointerEvents="none" />}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}>
          <strong>{fmtLabel(data[hover].date, unit, locale)}</strong>
          {keys.map((k) => (data[hover].parts[k.id] ? <span key={k.id}><i style={{ background: k.color }} /> {t(k.label)} <b>{money ? formatMoney(data[hover].parts[k.id]) : data[hover].parts[k.id]}</b></span> : null))}
          {line && <span><i style={{ background: line.color }} /> {t(line.label)} <b>{money ? formatMoney(data[hover][line.key]) : data[hover][line.key]}</b></span>}
        </div>
      )}
    </div>
  );
}

export const Legend = ({ keys }) => {
  const { t } = useLang();
  return <div className="chart-legend">{keys.map((k) => <span key={k.id || k.label}><i style={{ background: k.color }} /> {t(k.label)}</span>)}</div>;
};

/** Horizontal bars with labels: rows [{ label, value, sub? }]. */
export function HBars({ rows, money = false, color = '#1f7fb5', max: maxIn, translate = false, empty = 'No data for this period.' }) {
  const { t } = useLang();
  const max = maxIn || Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="muted mb-0">{t(empty)}</p>;
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="hb-top"><span className="hb-label">{translate ? t(r.label) : r.label}{r.sub && <small className="muted"> · {r.sub}</small>}</span><b dir="ltr">{money ? formatMoney(r.value) : r.value.toLocaleString()}</b></div>
          <span className="hb-track"><i style={{ width: `${(r.value / max) * 100}%`, background: r.color || color }} /></span>
        </li>
      ))}
    </ul>
  );
}

/** Donut with legend: parts [{ label, value, color }]. */
export function Donut({ parts, center, money = false, size = 132 }) {
  const { t } = useLang();
  const [hover, setHover] = useState(null);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const R = 50, C = 2 * Math.PI * R;
  let off = 0;
  const h = hover !== null ? parts[hover] : null;
  return (
    <div className="donut-row">
      <div className="donut" style={{ width: size, height: size }}>
        <svg viewBox="0 0 132 132" width={size} height={size}>
          <circle cx="66" cy="66" r={R} fill="none" stroke="#f1f4f9" strokeWidth="15" />
          {parts.map((p, i) => {
            const len = (p.value / total) * C;
            const el = <circle key={p.label} cx="66" cy="66" r={R} fill="none" stroke={p.color} strokeWidth={hover === i ? 18 : 15} strokeDasharray={`${Math.max(len - 2, 0.01)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 66 66)" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ opacity: hover !== null && hover !== i ? 0.35 : 1 }} />;
            off += len;
            return el;
          })}
        </svg>
        <div className="donut-center"><strong style={{ fontSize: money ? 13 : 22 }}>{h ? (money ? formatMoney(h.value) : h.value) : center?.value}</strong><span>{t(h ? h.label : center?.label || '')}</span></div>
      </div>
      <ul className="donut-legend">
        {parts.map((p, i) => (
          <li key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? 'on' : ''}>
            <span className="dl-name"><i style={{ background: p.color }} /> {t(p.label)}</span>
            <b dir="ltr">{money ? formatMoney(p.value) : p.value.toLocaleString()}</b>
            <small>{Math.round((p.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small KPI tile. */
export function Stat({ icon: Icon, tone = '', label, value, sub, onClick, trend }) {
  const { t } = useLang();
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`card stat ${onClick ? 'stat-click' : ''}`} onClick={onClick}>
      <div className="stat-head"><span className={`icon-box ${tone}`}>{Icon && <Icon size={18} />}</span>{trend !== undefined && trend !== null && <span className={`trend ${trend >= 0 ? 'up' : 'down'}`} dir="ltr">{trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(0)}%</span>}</div>
      <span className="stat-label">{t(label)}</span>
      <strong className="stat-value" dir="ltr">{value}</strong>
      {sub && <small className="muted">{sub}</small>}
    </Tag>
  );
}

export function RangePicker({ value, onChange, ranges }) {
  const { t } = useLang();
  return (
    <div className="chip-group range-picker">
      {ranges.map((r) => <button key={r.id} className={`chip ${value === r.id ? 'on' : ''}`} onClick={() => onChange(r.id)}>{t(r.label)}</button>)}
    </div>
  );
}

/** From / To date filter with quick presets. value = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }. */
export function DateRangeFilter({ value, onChange, presets }) {
  const { t } = useLang();
  const match = presets.find((p) => { const r = p.get(); return r.from === value.from && r.to === value.to; });
  const set = (k) => (e) => {
    const v = e.target.value;
    if (!v) return;
    const next = { ...value, [k]: v };
    if (next.from > next.to) { if (k === 'from') next.to = v; else next.from = v; } // keep From ≤ To
    onChange(next);
  };
  return (
    <div className="date-range" role="group" aria-label={t('Date range')}>
      <select className="input input-sm" value={match?.id || 'custom'} onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) onChange(p.get()); }} aria-label={t('Period')}>
        {presets.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
        <option value="custom" disabled>{t('Custom dates')}</option>
      </select>
      <label><span>{t('From')}</span><input className="input input-sm" type="date" dir="ltr" value={value.from} max={value.to} onChange={set('from')} /></label>
      <label><span>{t('To')}</span><input className="input input-sm" type="date" dir="ltr" value={value.to} min={value.from} onChange={set('to')} /></label>
    </div>
  );
}

/** "01 Nov 2026 – 07 Nov 2026" */
export const rangeText = (r, locale) => {
  const f = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }); };
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
};
