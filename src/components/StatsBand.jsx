import { useEffect, useRef, useState } from 'react';
import { Building2, Activity, ShieldCheck, Award } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';
import { getPlatform, localized } from '../services/platform';

const ICONS = [[Building2, '#0f5c94'], [Activity, '#1a86a6'], [ShieldCheck, '#b07f3e'], [Award, '#092f58']];

/**
 * Counts up from 85% of the value, so the real figure is visible from the first paint and no zero is ever
 * shown while the page loads (WEB-04). Values and texts come from Admin → Website content.
 */
function CountUp({ to, decimals = 0, suffix = '', start }) {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (!start) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setN(to); return undefined; }
    let raf; const t0 = performance.now(); const dur = 900; const from = to * 0.85;
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      setN(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, start]);
  return <>{n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}

export default function StatsBand() {
  const { t, lang } = useLang();
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  const stats = getPlatform().content.stats;

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="stats-wrap">
      <div className="container">
        <div className="stats" ref={ref}>
          {stats.map((s, i) => {
            const [Icon, color] = ICONS[i % ICONS.length];
            const num = Number(s.value);
            const isNum = s.value !== '' && !Number.isNaN(num);
            const decimals = isNum && String(s.value).includes('.') ? String(s.value).split('.')[1].length : 0;
            return (
              <div className="stat" key={i} style={{ '--c': color }}>
                <span className="stat-ic"><Icon size={20} /></span>
                <div>
                  <strong className="stat-num" dir="ltr">{isNum ? <CountUp to={num} suffix={s.suffix} decimals={decimals} start={seen} /> : `${s.value}${s.suffix || ''}`}</strong>
                  <span className="stat-label">{localized(s, 'label', lang, t)}</span>
                  <span className="stat-sub">{localized(s, 'sub', lang, t)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
