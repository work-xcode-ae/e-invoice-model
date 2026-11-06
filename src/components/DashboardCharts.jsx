import { useState } from 'react';
import { CheckCircle2, Loader, Clock, XCircle } from 'lucide-react';

const BLUE = '#3b82f6';
const RED = '#ef4444';
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/* ---------- Invoices per day (bar, failed stacked on top) ---------- */
export function DailyChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 220, padL = 34, padB = 26, padT = 10;
  const max = Math.max(...days.map((d) => d.sent + d.failed), 1);
  const nice = Math.ceil(max / 10) * 10;
  const plotW = W - padL - 8, plotH = H - padB - padT;
  const slot = plotW / days.length;
  const bw = Math.min(22, slot * 0.56);
  const y = (v) => padT + plotH - (v / nice) * plotH;
  const ticks = [0, nice / 2, nice];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Invoices sent and failed per day, last 14 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#eef1f6" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const sentTop = y(d.sent);
          const failedTop = y(d.sent + d.failed);
          const on = hover === i;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill={on ? 'rgba(59,130,246,.06)' : 'transparent'} />
              <path d={roundTop(x, sentTop, bw, y(0) - sentTop, d.failed ? 0 : 4)} fill={BLUE} opacity={hover === null || on ? 1 : 0.45} />
              {d.failed > 0 && (
                <path d={roundTop(x, failedTop, bw, Math.max(sentTop - failedTop - 2, 1.5), 4)} fill={RED} opacity={hover === null || on ? 1 : 0.45} />
              )}
              {i % 2 === 1 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="chart-tick">{fmtDay(d.date)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}>
          <strong>{fmtDay(days[hover].date)}</strong>
          <span><i style={{ background: BLUE }} /> Sent <b>{days[hover].sent}</b></span>
          <span><i style={{ background: RED }} /> Failed <b>{days[hover].failed}</b></span>
        </div>
      )}
    </div>
  );
}

function roundTop(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export const ChartLegend = () => (
  <div className="chart-legend">
    <span><i style={{ background: BLUE }} /> Sent</span>
    <span><i style={{ background: RED }} /> Failed</span>
  </div>
);

/* ---------- Status breakdown (donut) ---------- */
const STATUS = [
  { key: 'sent', label: 'Sent', color: '#16a34a', icon: CheckCircle2 },
  { key: 'processing', label: 'Processing', color: '#3b82f6', icon: Loader },
  { key: 'queued', label: 'Queued', color: '#f59e0b', icon: Clock },
  { key: 'failed', label: 'Failed', color: '#ef4444', icon: XCircle },
];

export function StatusDonut({ totals }) {
  const [hover, setHover] = useState(null);
  const total = STATUS.reduce((a, s) => a + totals[s.key], 0) || 1;
  const R = 54, C = 2 * Math.PI * R, gap = 3;
  let offset = 0;
  const center = hover ? STATUS.find((s) => s.key === hover) : null;

  return (
    <div className="donut-row">
      <div className="donut">
        <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Invoice status breakdown">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f4f9" strokeWidth="16" />
          {STATUS.map((s) => {
            const len = (totals[s.key] / total) * C;
            const seg = (
              <circle key={s.key} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth={hover === s.key ? 19 : 16}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`} strokeDashoffset={-offset}
                transform="rotate(-90 70 70)" style={{ transition: 'stroke-width .15s', opacity: hover && hover !== s.key ? 0.35 : 1 }}
                onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="donut-center">
          <strong>{(center ? totals[center.key] : total).toLocaleString()}</strong>
          <span>{center ? center.label : 'Invoices'}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {STATUS.map(({ key, label, color, icon: Icon }) => (
          <li key={key} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)} className={hover === key ? 'on' : ''}>
            <span className="dl-name"><i style={{ background: color }} /> <Icon size={13} /> {label}</span>
            <b>{totals[key].toLocaleString()}</b>
            <small>{Math.round((totals[key] / total) * 1000) / 10}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Tiny sparkline for KPI tiles ---------- */
export function Sparkline({ values, color = BLUE }) {
  const W = 90, H = 30;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / (max - min || 1)) * (H - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} opacity=".08" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
